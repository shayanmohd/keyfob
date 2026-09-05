package com.mohdshayan.keyfob

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONArray
import java.io.File
import java.io.FileOutputStream

/**
 * Shell for Keyfob. The app itself is the offline web core in assets/www,
 * served from an app-private https origin so storage, media and pointer events
 * behave exactly as they do in Chrome. Native side adds amplitude haptics,
 * file export and permission plumbing.
 */
class MainActivity : ComponentActivity() {
    private companion object { const val TAG = "Keyfob" }

    private lateinit var web: WebView
    private var pendingWebPermission: PermissionRequest? = null
    private var pendingGeo: Pair<String, GeolocationPermissions.Callback>? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var insetCss: String? = null

    private val vibrator: Vibrator? by lazy {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
    }

    private lateinit var permissionLauncher: ActivityResultLauncher<Array<String>>
    private lateinit var fileLauncher: ActivityResultLauncher<Intent>

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        permissionLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
            val ok = grants.values.all { it }
            pendingWebPermission?.let { req ->
                if (ok) req.grant(req.resources) else req.deny()
                pendingWebPermission = null
            }
            pendingGeo?.let { (origin, cb) ->
                cb.invoke(origin, ok, false)
                pendingGeo = null
            }
        }
        fileLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val cb = fileCallback ?: return@registerForActivityResult
            fileCallback = null
            cb.onReceiveValue(
                if (result.resultCode == Activity.RESULT_OK)
                    WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
                else null
            )
        }

        val shellBg = getColor(R.color.shell_bg)

        web = WebView(this).apply {
            setBackgroundColor(shellBg)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.setSupportZoom(false)
            settings.builtInZoomControls = false
            settings.displayZoomControls = false
            settings.useWideViewPort = true
            settings.loadWithOverviewMode = true
            settings.textZoom = 100
            overScrollMode = View.OVER_SCROLL_NEVER
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            addJavascriptInterface(Native(), "Native")
        }

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.scheme == "https" && u.host == "appassets.androidplatform.net") return false
                // Anything genuinely external opens in the browser, never in-app.
                return try { startActivity(Intent(Intent.ACTION_VIEW, u)); true } catch (e: Exception) { true }
            }
            override fun onPageFinished(view: WebView, url: String) {
                Log.i(TAG, "page finished: $url")
                insetCss?.let { view.evaluateJavascript(it, null) }
            }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                Log.e(TAG, "load error ${error.errorCode} ${error.description} for ${request.url}")
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                Log.i(TAG, "js ${m.messageLevel()} ${m.sourceId()}:${m.lineNumber()} ${m.message()}"); return true
            }
            override fun onPermissionRequest(request: PermissionRequest) {
                val needed = mutableListOf<String>()
                for (r in request.resources) {
                    when (r) {
                        PermissionRequest.RESOURCE_VIDEO_CAPTURE -> needed.add(Manifest.permission.CAMERA)
                        PermissionRequest.RESOURCE_AUDIO_CAPTURE -> needed.add(Manifest.permission.RECORD_AUDIO)
                    }
                }
                val missing = needed.filter {
                    ContextCompat.checkSelfPermission(this@MainActivity, it) != PackageManager.PERMISSION_GRANTED
                }
                if (missing.isEmpty()) { request.grant(request.resources); return }
                pendingWebPermission = request
                permissionLauncher.launch(missing.toTypedArray())
            }
            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                val fine = Manifest.permission.ACCESS_FINE_LOCATION
                if (ContextCompat.checkSelfPermission(this@MainActivity, fine) == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false); return
                }
                pendingGeo = origin to callback
                permissionLauncher.launch(arrayOf(fine, Manifest.permission.ACCESS_COARSE_LOCATION))
            }
            override fun onShowFileChooser(
                view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try { fileLauncher.launch(params.createIntent()); true }
                catch (e: Exception) { fileCallback = null; false }
            }
        }

        setContentView(web)
        ViewCompat.setOnApplyWindowInsetsListener(web) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val d = resources.displayMetrics.density
            // The page pads its own chrome: WebView padding does not move position:fixed content.
            // Insets can arrive before the document exists, so guard before touching it.
            insetCss = "if(document.documentElement){" +
                       "document.documentElement.style.setProperty('--sat','" + (bars.top / d) + "px');" +
                       "document.documentElement.style.setProperty('--sab','" + (bars.bottom / d) + "px');}"
            web.evaluateJavascript(insetCss ?: "", null)
            insets
        }
        ViewCompat.requestApplyInsets(web)
        web.loadUrl("https://appassets.androidplatform.net/www/index.html")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // The web app gets first refusal on Back; "handled" means it consumed it.
                web.evaluateJavascript(
                    "(function(){ try { return (window.App && App.back && App.back()) ? 'handled' : 'exit' } catch(e) { return 'exit' } })()"
                ) { result -> if (result == null || !result.contains("handled")) finish() }
            }
        })
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        
        
        web.evaluateJavascript("window.App && App.onResume && App.onResume()", null)
    }

    override fun onPause() {
        web.evaluateJavascript("window.App && App.onPause && App.onPause()", null)
        web.onPause()
        
        super.onPause()
    }

    override fun onDestroy() { web.destroy(); super.onDestroy() }



    /** Exposed to JS as window.Native. */
    inner class Native {
        @JavascriptInterface fun isNative(): Boolean = true

        @JavascriptInterface
        fun vibrate(ms: Int, amplitude: Int) {
            val v = vibrator ?: return
            if (!v.hasVibrator()) return
            val amp = if (v.hasAmplitudeControl()) amplitude.coerceIn(1, 255) else VibrationEffect.DEFAULT_AMPLITUDE
            v.vibrate(VibrationEffect.createOneShot(ms.coerceIn(1, 2000).toLong(), amp))
        }

        @JavascriptInterface
        fun vibratePattern(json: String, amplitude: Int) {
            val v = vibrator ?: return
            if (!v.hasVibrator()) return
            val arr = try { JSONArray(json) } catch (e: Exception) { return }
            // JS pattern is [on, off, on, ...]; VibrationEffect wants [off, on, off, ...]
            val timings = LongArray(arr.length() + 1)
            val amps = IntArray(arr.length() + 1)
            timings[0] = 0; amps[0] = 0
            val amp = if (v.hasAmplitudeControl()) amplitude.coerceIn(1, 255) else VibrationEffect.DEFAULT_AMPLITUDE
            for (i in 0 until arr.length()) {
                timings[i + 1] = arr.optLong(i, 0).coerceIn(0, 2000)
                amps[i + 1] = if (i % 2 == 0) amp else 0
            }
            v.vibrate(VibrationEffect.createWaveform(timings, amps, -1))
        }

        @JavascriptInterface fun hasAmplitudeControl(): Boolean = vibrator?.hasAmplitudeControl() == true

        @JavascriptInterface fun cancelVibration() { vibrator?.cancel() }

        @JavascriptInterface fun keepAwake(on: Boolean) {
            runOnUiThread {
                if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }

        /** Writes a file the user can find. Returns a uri string, or "" on failure. */
        @JavascriptInterface
        fun saveFile(name: String, mime: String, base64: String): String {
            return try {
                val bytes = Base64.decode(base64, Base64.DEFAULT)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, name)
                        put(MediaStore.Downloads.MIME_TYPE, mime)
                        put(MediaStore.Downloads.IS_PENDING, 1)
                    }
                    val resolver = contentResolver
                    val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                        ?: return ""
                    resolver.openOutputStream(uri)?.use { it.write(bytes) }
                    values.clear(); values.put(MediaStore.Downloads.IS_PENDING, 0)
                    resolver.update(uri, values, null, null)
                    uri.toString()
                } else {
                    val dir = getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS) ?: filesDir
                    val f = File(dir, name)
                    FileOutputStream(f).use { it.write(bytes) }
                    Uri.fromFile(f).toString()
                }
            } catch (e: Exception) { Log.e(TAG, "saveFile failed", e); "" }
        }

        @JavascriptInterface
        fun shareText(subject: String, text: String) {
            val i = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_SUBJECT, subject)
                putExtra(Intent.EXTRA_TEXT, text)
            }
            runOnUiThread { startActivity(Intent.createChooser(i, subject.ifEmpty { "Share" })) }
        }



        @JavascriptInterface
        fun shareUri(uriString: String, mime: String) {
            val i = Intent(Intent.ACTION_SEND).apply {
                type = mime
                putExtra(Intent.EXTRA_STREAM, Uri.parse(uriString))
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            runOnUiThread { startActivity(Intent.createChooser(i, "Share")) }
        }
    }
}
