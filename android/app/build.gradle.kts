plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}
android {
    namespace = "com.telecarsee.demo"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.telecarsee.demo"
        minSdk = 28
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0-demo"
        ndk { abiFilters += "arm64-v8a" }
    }
    signingConfigs {
        create("demoRelease") {
            providers.environmentVariable("TELECAR_KEYSTORE_PATH").orNull?.let {
                storeFile = rootProject.file(it)
            }
            storePassword = providers.environmentVariable("TELECAR_KEYSTORE_PASSWORD").orNull
            keyAlias = providers.environmentVariable("TELECAR_KEY_ALIAS").orElse("demo").get()
            keyPassword = providers.environmentVariable("TELECAR_KEY_PASSWORD").orNull
        }
    }
    buildTypes { release { isMinifyEnabled = false; signingConfig = signingConfigs.getByName("demoRelease") } }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}
dependencies {
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.ui:ui-android:1.8.2")
    implementation("androidx.compose.foundation:foundation-android:1.8.2")
    implementation("androidx.compose.material3:material3-android:1.3.2")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("io.livekit:livekit-android:2.20.3")
    implementation("ai.pleos.playground:TextToSpeech:3.3.1")
}
