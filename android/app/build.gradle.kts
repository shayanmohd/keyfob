import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) keystoreProperties.load(FileInputStream(keystorePropertiesFile))

android {
    namespace = "com.mohdshayan.keyfob"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.mohdshayan.keyfob"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        create("release") {
            if (keystorePropertiesFile.exists()) {
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    sourceSets.getByName("main").kotlin.srcDir("src/main/kotlin")
    bundle { language { enableSplit = false } }
}

// The web core lives in ../web and is copied into assets on every build.
val syncWebAssets = tasks.register<Copy>("syncWebAssets") {
    from(rootProject.file("../web")) { exclude("**/.DS_Store") }
    into(layout.projectDirectory.dir("src/main/assets/www"))
}
tasks.named("preBuild") { dependsOn(syncWebAssets) }

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}
