package com.ezzyerp.app;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  /**
   * Safety: if remote shell never calls SplashScreen.hide() (offline / load fail),
   * dismiss native splash so errorPath / WebView is visible instead of a stuck blue screen.
   */
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    new Handler(Looper.getMainLooper()).postDelayed(() -> {
      try {
        if (getBridge() != null) {
          getBridge()
            .eval(
              "try{window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.SplashScreen&&window.Capacitor.Plugins.SplashScreen.hide();}catch(e){}",
              null
            );
        }
      } catch (Exception ignored) {
        // Bridge may not be ready; ignore.
      }
    }, 18_000);
  }
}
