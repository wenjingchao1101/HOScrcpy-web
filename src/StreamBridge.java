import com.huawei.hosscrcpy.api.HosRemoteConfig;
import com.huawei.hosscrcpy.api.HosRemoteDevice;
import com.huawei.hosscrcpy.api.ScreenCapCallback;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.HashMap;
import java.util.Map;

public class StreamBridge {

    private static final Map<String, String> KEY_MAP = new HashMap<>();
    static {
        KEY_MAP.put("back",    "uinput -K -d 2 -u 2");
        KEY_MAP.put("home",    "uitest uiInput keyEvent Home");
        KEY_MAP.put("volup",   "uinput -K -d 16 -u 16");
        KEY_MAP.put("voldown", "uinput -K -d 17 -u 17");
        KEY_MAP.put("power",   "uinput -K -d 18 -u 18");
        KEY_MAP.put("reboot",  "reboot");
    }

    public static void main(String[] args) throws Exception {
        if (args.length < 2) {
            System.err.println("Usage: StreamBridge <ip> <sn>");
            System.exit(1);
        }

        String ip = args[0];
        String sn = args[1];

        HosRemoteConfig config = new HosRemoteConfig(sn);
        config.setIp(ip);
        HosRemoteDevice device = new HosRemoteDevice(config);

        System.err.println("Connected to " + ip + "/" + sn);

        final java.io.OutputStream stdout = System.out;
        final Object lock = new Object();

        device.startImageScreenCapture(new ScreenCapCallback() {
            @Override
            public void onData(ByteBuffer byteBuffer) {
                try {
                    byte[] data = byteBuffer.array();
                    byte[] header = new byte[4];
                    ByteBuffer.wrap(header).order(ByteOrder.BIG_ENDIAN).putInt(data.length);
                    synchronized (lock) {
                        stdout.write(header);
                        stdout.write(data);
                        stdout.flush();
                    }
                } catch (Exception e) {
                    System.err.println("Write error: " + e.getMessage());
                }
            }

            @Override
            public void onException(Throwable throwable) {
                System.err.println("Stream error: " + throwable.getMessage());
                System.exit(1);
            }

            @Override
            public void onReady() {
                System.err.println("Image stream ready");
            }
        });

        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
        String line;
        while ((line = reader.readLine()) != null) {
            try {
                line = line.trim();
                if (line.isEmpty()) continue;

                String type = extractString(line, "type");

                if ("touch".equals(type)) {
                    String event = extractString(line, "e");
                    int x = extractInt(line, "x");
                    int y = extractInt(line, "y");
                    if ("down".equals(event)) {
                        device.onTouchDown(x, y);
                    } else if ("up".equals(event)) {
                        device.onTouchUp(x, y);
                    } else if ("move".equals(event)) {
                        device.onTouchMove(x, y);
                    }
                } else if ("key".equals(type)) {
                    String key = extractString(line, "key");
                    String cmd = KEY_MAP.get(key);
                    if (cmd != null) {
                        final String fcmd = cmd;
                        new Thread(() -> {
                            try { device.executeShellCommand(fcmd, 3); }
                            catch (Exception e) { System.err.println("Key error: " + e.getMessage()); }
                        }).start();
                    }
                }
            } catch (Exception e) {
                System.err.println("Parse error: " + e.getMessage());
            }
        }
    }

    private static String extractString(String json, String key) {
        String search = "\"" + key + "\":\"";
        int start = json.indexOf(search);
        if (start < 0) return null;
        start += search.length();
        int end = json.indexOf("\"", start);
        return json.substring(start, end);
    }

    private static int extractInt(String json, String key) {
        String search = "\"" + key + "\":";
        int start = json.indexOf(search);
        if (start < 0) return 0;
        start += search.length();
        int end = start;
        while (end < json.length() && (Character.isDigit(json.charAt(end)) || json.charAt(end) == '-')) end++;
        return Integer.parseInt(json.substring(start, end));
    }
}
