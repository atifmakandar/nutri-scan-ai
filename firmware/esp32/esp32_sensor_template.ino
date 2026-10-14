/* Nutri-Scan AI — ESP32 sensor acquisition template
   Replace placeholder sensor reads with validated modules before field use. */
#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASSWORD = "YOUR_PASSWORD";
const char* API_URL = "http://YOUR_BACKEND_IP:8000/api/v1/analyze";

float readMoisture(){ return 62.0; }
float readPH(){ return 4.2; }
float readTemperature(){ return 24.0; }
float readHumidity(){ return 68.0; }

void setup(){
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while(WiFi.status()!=WL_CONNECTED){ delay(500); Serial.print("."); }
  Serial.println("\nWiFi connected");
}

void loop(){
  if(WiFi.status()==WL_CONNECTED){
    HTTPClient http;
    http.begin(API_URL);
    http.addHeader("Content-Type", "application/json");
    String payload = String("{\"sample_type\":\"silage\",\"sensor\":{")+
      "\"moisture_pct\":"+readMoisture()+","+
      "\"ph\":"+readPH()+","+
      "\"temperature_c\":"+readTemperature()+","+
      "\"humidity_pct\":"+readHumidity()+"},"+
      "\"nir\":{\"protein_pct\":8.8,\"dry_matter_pct\":38,\"fiber_pct\":28},"+
      "\"vision\":{\"mold_score\":0.08,\"color_anomaly\":0.05,\"surface_damage\":0.02}}";
    int code=http.POST(payload);
    Serial.printf("API response: %d\n", code);
    http.end();
  }
  delay(30000);
}
