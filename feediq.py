import time
import random
import json
from datetime import datetime

# ==========================================
# 1. HARDWARE INTERFACE (Sensors & Cameras)
# ==========================================
class SensorHub:
    def __init__(self):
        self.status = "Connected"

    def get_nir_spectroscopy_data(self):
        """Simulates 128-point NIR spectral reflectance data."""
        return [round(random.uniform(0.1, 0.9), 4) for _ in range(128)]

    def get_biosensor_data(self):
        """Simulates moisture and temperature readings."""
        return {
            "moisture_percentage": round(random.uniform(10.0, 40.0), 1),
            "temperature_celsius": round(random.uniform(25.0, 35.0), 1)
        }

    def capture_feed_image(self):
        """Simulates capturing a macro image for CV analysis."""
        return "image_array_data"

# ==========================================
# 2. AI & MACHINE LEARNING INFERENCE
# ==========================================
class MLInferenceEngine:
    def __init__(self):
        self.models_loaded = True

    def predict_nutrition(self, nir_data):
        """Mock Chemometric Regression Model (e.g., PLS or Random Forest)."""
        base_protein = 15.0 + (sum(nir_data[:20]) * 0.1)
        base_fiber = 20.0 + (sum(nir_data[20:40]) * 0.1)
        base_energy = 2.5 + (sum(nir_data[40:60]) * 0.01)

        return {
            "crude_protein_pct": round(base_protein, 2),
            "crude_fiber_pct": round(base_fiber, 2),
            "metabolizable_energy": round(base_energy, 2)
        }

    def detect_adulteration(self, image_data):
        """Mock CNN for visual adulterant/fungus detection."""
        risk_score = random.random()
        if risk_score > 0.85:
            return {"status": "Contaminated", "toxin": "Aflatoxin detected", "confidence": 0.92}
        elif risk_score > 0.70:
            return {"status": "Warning", "toxin": "Urea/Sand mixture suspected", "confidence": 0.78}
        else:
            return {"status": "Safe", "toxin": "None", "confidence": 0.95}

# ==========================================
# 3. DECISION & ADVISORY SYSTEM
# ==========================================
class AdvisoryEngine:
    @staticmethod
    def generate_report(nutrition, contamination, biosensors):
        advisory = []

        if contamination['status'] == "Contaminated":
            advisory.append("CRITICAL: Reject this batch. Toxic contamination detected.")
            return advisory

        if biosensors['moisture_percentage'] > 30.0:
            advisory.append("Warning: High moisture. High risk of fungal growth during storage.")
        elif biosensors['moisture_percentage'] < 15.0:
            advisory.append("Note: Feed is extremely dry. Palatability may be reduced.")

        if nutrition['crude_protein_pct'] < 16.0:
            advisory.append("Action: Low protein detected. Supplement with Soybean Meal or Cottonseed Cake.")
        if nutrition['crude_fiber_pct'] > 25.0:
            advisory.append("Action: High fiber detected. May reduce digestibility; consider adding molasses.")

        if not advisory:
            advisory.append("Excellent quality. Optimal for lactating dairy cows.")

        return advisory

# ==========================================
# 4. MAIN EXECUTION (The Local Pipeline)
# ==========================================
history = []

def clear_screen():
    print("\n" * 50)

def print_banner():
    print("=" * 60)
    print("   FEEDIQ - SMART FEED QUALITY ANALYSIS SYSTEM")
    print("   Edge AI for Livestock Feed Testing")
    print("=" * 60)

def print_menu():
    print("\n--- MAIN MENU ---")
    print("  [1] Run New Feed Analysis")
    print("  [2] View Analysis History")
    print("  [3] View Last Analysis")
    print("  [4] Exit")
    print("-" * 20)

def run_feed_analysis():
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Starting Feed Analysis...")

    sensors = SensorHub()
    ai = MLInferenceEngine()
    advisory = AdvisoryEngine()

    print(">> Reading NIR Spectrometer...")
    time.sleep(0.5)

    nir_data = sensors.get_nir_spectroscopy_data()
    bio_data = sensors.get_biosensor_data()
    img_data = sensors.capture_feed_image()

    print(">> Running ML Inference (Nutrition + Safety)...")
    time.sleep(0.5)

    nutrition_results = ai.predict_nutrition(nir_data)
    contamination_results = ai.detect_adulteration(img_data)

    recommendations = advisory.generate_report(nutrition_results, contamination_results, bio_data)

    final_payload = {
        "timestamp": datetime.now().isoformat(),
        "device_id": "FEED_IQ_EDGE_001",
        "environmental_sensors": bio_data,
        "nutritional_profile": nutrition_results,
        "safety_analysis": contamination_results,
        "farmer_advisory": recommendations
    }

    history.append(final_payload)

    print("\n" + "=" * 50)
    print("   ANALYSIS COMPLETE")
    print("=" * 50)
    print(json.dumps(final_payload, indent=4))
    print("=" * 50)
    print(">> Data synced to AWS IoT Core/Firebase.")
    return final_payload

def view_history():
    if not history:
        print("\nNo analyses performed yet.")
        return
    print(f"\n--- ANALYSIS HISTORY ({len(history)} records) ---")
    for i, record in enumerate(history, 1):
        ts = record['timestamp']
        status = record['safety_analysis']['status']
        protein = record['nutritional_profile']['crude_protein_pct']
        print(f"  [{i}] {ts} | Safety: {status} | Protein: {protein}%")
    print("-" * 40)

def view_last():
    if not history:
        print("\nNo analyses performed yet.")
        return
    print(json.dumps(history[-1], indent=4))

def main():
    print_banner()
    sensors = SensorHub()
    ai = MLInferenceEngine()
    advisory = AdvisoryEngine()
    print(f"System Status: {sensors.status}")
    print(f"Models Loaded: {ai.models_loaded}")
    print("Ready for analysis.\n")

    while True:
        print_menu()
        choice = input("Select option (1-4): ").strip()

        if choice == "1":
            run_feed_analysis()
        elif choice == "2":
            view_history()
        elif choice == "3":
            view_last()
        elif choice == "4":
            print("\nShutting down FeedIQ. Goodbye!")
            break
        else:
            print("Invalid option. Please select 1-4.")

if __name__ == "__main__":
    main()
