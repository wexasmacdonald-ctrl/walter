package com.macdonaldautomation.blowpin

import android.app.Application
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.net.Uri
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.uimanager.ViewManager
import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
    this,
    object : DefaultReactNativeHost(this) {
      override fun getPackages(): List<ReactPackage> =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
          add(PinIconRendererPackage())
        }

      override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

      override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

      override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
    }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}

class PinIconRendererPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(PinIconRendererModule(reactContext))
  }

  override fun createViewManagers(
    reactContext: ReactApplicationContext
  ): List<ViewManager<*, *>> {
    return emptyList()
  }
}

class PinIconRendererModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val MODULE_NAME = "PinIconRenderer"
    private const val ICON_WIDTH_PX = 140
    private const val ICON_HEIGHT_PX = 60
    private const val POINTER_HEIGHT = 10f
    private const val POINTER_HALF_WIDTH = 10f
    private const val CORNER_RADIUS = 18f
    private const val MAX_LABEL_LENGTH = 24

    private val memoryCache = ConcurrentHashMap<String, String>()
  }

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun generatePinIcon(
    label: String,
    status: String,
    theme: String,
    templateVersion: String,
    promise: Promise
  ) {
    try {
      val normalizedLabel = normalizeLabel(label)
      val normalizedStatus = if (status == "complete") "complete" else "pending"
      val normalizedTheme = if (theme == "dark") "dark" else "light"
      val densityDpi = reactContext.resources.displayMetrics.densityDpi
      val key = "$normalizedLabel|$normalizedStatus|$normalizedTheme|$templateVersion|$densityDpi"

      val cachedUri = memoryCache[key]
      if (!cachedUri.isNullOrBlank()) {
        val cachedPath = Uri.parse(cachedUri).path
        if (!cachedPath.isNullOrBlank() && File(cachedPath).exists()) {
          promise.resolve(cachedUri)
          return
        }
        memoryCache.remove(key)
      }

      val cacheDir = File(reactContext.cacheDir, "marker-icons")
      if (!cacheDir.exists() && !cacheDir.mkdirs()) {
        promise.reject("PIN_ICON_CACHE_DIR_FAILED", "Failed to create marker icon cache directory")
        return
      }

      val fileName = "${sha256(key)}.png"
      val file = File(cacheDir, fileName)
      val uri = Uri.fromFile(file).toString()

      if (file.exists() && file.length() > 0L) {
        memoryCache[key] = uri
        promise.resolve(uri)
        return
      }

      val bitmap = Bitmap.createBitmap(ICON_WIDTH_PX, ICON_HEIGHT_PX, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(bitmap)
      drawPin(canvas, normalizedLabel, normalizedStatus, normalizedTheme)

      FileOutputStream(file).use { output ->
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)
      }
      bitmap.recycle()

      memoryCache[key] = uri
      promise.resolve(uri)
    } catch (error: Throwable) {
      promise.reject("PIN_ICON_RENDER_FAILED", "Failed to generate pin icon", error)
    }
  }

  private fun drawPin(canvas: Canvas, label: String, status: String, theme: String) {
    val width = ICON_WIDTH_PX.toFloat()
    val height = ICON_HEIGHT_PX.toFloat()
    val bodyHeight = height - POINTER_HEIGHT
    val fillColor = if (status == "complete") Color.parseColor("#16A34A") else Color.parseColor("#2563EB")
    val strokeColor = if (theme == "dark") Color.parseColor("#55000000") else Color.parseColor("#33000000")

    val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.FILL
      color = fillColor
    }
    val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      color = strokeColor
      strokeWidth = 1.5f
    }

    val bodyRect = RectF(1f, 1f, width - 1f, bodyHeight)
    canvas.drawRoundRect(bodyRect, CORNER_RADIUS, CORNER_RADIUS, fillPaint)
    canvas.drawRoundRect(bodyRect, CORNER_RADIUS, CORNER_RADIUS, strokePaint)

    val pointerCenterX = width / 2f
    val pointerPath = Path().apply {
      moveTo(pointerCenterX - POINTER_HALF_WIDTH, bodyHeight - 1f)
      lineTo(pointerCenterX, height - 1f)
      lineTo(pointerCenterX + POINTER_HALF_WIDTH, bodyHeight - 1f)
      close()
    }
    canvas.drawPath(pointerPath, fillPaint)
    canvas.drawPath(pointerPath, strokePaint)

    val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.WHITE
      textAlign = Paint.Align.CENTER
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      isLinearText = true
    }

    val maxTextWidth = width - 16f
    val fittedLabel = fitLabelToWidth(label, textPaint, maxTextWidth)
    val baseline = (bodyHeight / 2f) - ((textPaint.fontMetrics.ascent + textPaint.fontMetrics.descent) / 2f) + 1.5f
    canvas.drawText(fittedLabel, pointerCenterX, baseline, textPaint)
  }

  private fun fitLabelToWidth(label: String, paint: Paint, maxWidth: Float): String {
    val clean = label.trim().ifEmpty { "?" }
    val textSizes = floatArrayOf(26f, 24f, 22f, 20f, 18f, 16f, 14f, 12f)

    for (size in textSizes) {
      paint.textSize = size
      if (paint.measureText(clean) <= maxWidth) {
        return clean
      }
    }

    paint.textSize = textSizes.last()
    val ellipsis = "..."
    var candidate = clean

    while (candidate.length > 1 && paint.measureText(candidate + ellipsis) > maxWidth) {
      candidate = candidate.dropLast(1)
    }

    return if (candidate.length < clean.length) {
      candidate + ellipsis
    } else {
      candidate
    }
  }

  private fun normalizeLabel(raw: String): String {
    val trimmed = raw.trim()
    if (trimmed.isEmpty()) {
      return "?"
    }

    val tokenMatch = Regex("^(\\d+[A-Za-z0-9-]*)\\b").find(trimmed)
    val token = tokenMatch?.groupValues?.get(1)
      ?: trimmed.split(Regex("\\s+")).firstOrNull().orEmpty()

    val normalized = if (token.isBlank()) trimmed else token
    return normalized.take(MAX_LABEL_LENGTH)
  }

  private fun sha256(value: String): String {
    val bytes = MessageDigest.getInstance("SHA-256").digest(value.toByteArray())
    val result = StringBuilder(bytes.size * 2)
    for (byte in bytes) {
      result.append(String.format("%02x", byte))
    }
    return result.toString()
  }
}
