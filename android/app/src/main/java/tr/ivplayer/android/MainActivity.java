package tr.ivplayer.android;

import android.content.pm.ActivityInfo;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(IvPlayerTvPlugin.class);
    super.onCreate(savedInstanceState);
    setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
    applyImmersive();
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) {
      applyImmersive();
    }
  }

  @Override
  public void onResume() {
    super.onResume();
    applyImmersive();
  }

  private void applyImmersive() {
    Window window = getWindow();
    if (window == null) {
      return;
    }
    WindowCompat.setDecorFitsSystemWindows(window, false);
    View decor = window.getDecorView();
    WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decor);
    controller.hide(WindowInsetsCompat.Type.systemBars());
    controller.setSystemBarsBehavior(
        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
  }
}
