package tr.ivplayer.android;

import android.app.UiModeManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "IvPlayerTv")
public class IvPlayerTvPlugin extends Plugin {
  @PluginMethod
  public void isTelevision(PluginCall call) {
    JSObject ret = new JSObject();
    ret.put("value", isTelevisionDevice(getContext()));
    call.resolve(ret);
  }

  static boolean isTelevisionDevice(Context context) {
    if (context == null) {
      return false;
    }
    UiModeManager uiMode = (UiModeManager) context.getSystemService(Context.UI_MODE_SERVICE);
    if (uiMode != null && uiMode.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION) {
      return true;
    }
    PackageManager pm = context.getPackageManager();
    return pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
        || pm.hasSystemFeature("amazon.hardware.fire_tv");
  }
}
