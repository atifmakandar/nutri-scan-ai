from datetime import datetime, timezone
from uuid import uuid4
from .models import AnalyzeRequest, AnalysisResult, CapabilitySignal


def clamp(x, lo=0.0, hi=100.0):
    return max(lo, min(hi, x))


def analyze(req: AnalyzeRequest) -> AnalysisResult:
    s, n, v = req.sensor, req.nir, req.vision
    extra = req.supplemental

    # Transparent prototype baseline. Production models should be calibrated against
    # laboratory reference measurements before deployment.
    ph_score = 100 - min(abs(s.ph - 4.2) * 20, 100) if req.sample_type == "silage" else 85
    moisture_score = 100 - min(abs(s.moisture_pct - (62 if req.sample_type == "silage" else 12)) * 2.2, 100)
    vision_penalty = (v.mold_score * 45 + v.color_anomaly * 25 + v.surface_damage * 10)
    nutritional_score = clamp((n.protein_pct * 4) + (n.dry_matter_pct * 0.7) - (n.fiber_pct * 0.8) + 45)
    score = clamp(0.28 * ph_score + 0.22 * moisture_score + 0.25 * nutritional_score + 0.25 * (100 - vision_penalty))

    risk = "LOW" if score >= 75 else "MEDIUM" if score >= 50 else "HIGH"
    confidence = clamp(70 + (min(n.dry_matter_pct, 60) / 6) - v.mold_score * 10, 55, 96)

    anomalies = []
    if v.mold_score > 0.35: anomalies.append("Operator-reported visible mould indicator requires review")
    if v.color_anomaly > 0.35: anomalies.append("Unusual sample colour pattern")
    if s.temperature_c > 35: anomalies.append("Elevated temperature in supplied storage reading")
    if req.sample_type == "silage" and not (3.8 <= s.ph <= 4.8): anomalies.append("Silage pH outside prototype target range")
    if not anomalies: anomalies.append("No major anomaly indicator in supplied prototype inputs")

    advisory = []
    if v.mold_score > 0.35: advisory.append("Isolate the affected batch and verify the operator-reported mould concern with a qualified test before feeding.")
    if s.temperature_c > 35: advisory.append("Inspect storage ventilation and temperature conditions; this is a spot-check, not continuous monitoring.")
    if req.sample_type == "silage" and s.ph > 4.8: advisory.append("Review fermentation and storage conditions; confirm pH with a validated method.")
    if extra and any(value is not None and value >= 0.5 for value in (
        extra.urea_concern_score, extra.sand_silica_concern_score,
        extra.aflatoxin_concern_score, extra.fungal_concern_score,
        extra.mineral_concern_score,
    )):
        advisory.extend(["Adulteration, toxin, and fungal concerns are not detected by this prototype; use qualified laboratory testing."])
    if score >= 75: advisory.append("Prototype assessment is within the acceptable screening band; continue routine monitoring.")
    else: advisory.append("Use the result as a screening signal and consider confirmatory laboratory testing.")

    parameters = {
        "moisture_pct": s.moisture_pct, "dry_matter_pct": n.dry_matter_pct,
        "protein_pct": n.protein_pct, "fiber_pct": n.fiber_pct, "ph": s.ph,
        "temperature_c": s.temperature_c, "humidity_pct": s.humidity_pct,
        "fermentation_quality": "Good" if ph_score >= 75 else "Review",
        "spoilage_risk": "Low" if v.mold_score < 0.25 else "Medium" if v.mold_score < 0.5 else "High",
        "nutritional_score": round(nutritional_score, 1),
    }
    signals: list[CapabilitySignal] = []
    if extra:
        for field, code in (("energy_mj_per_kg", "energy_reported"), ("calcium_pct", "minerals_reported"), ("phosphorus_pct", "minerals_reported")):
            value = getattr(extra, field)
            if value is not None:
                parameters[field] = value
                if not any(signal.code == code for signal in signals):
                    signals.append(CapabilitySignal(code=code, status="reported"))
        for field, code in (
            ("mineral_concern_score", "mineral_concern"),
            ("urea_concern_score", "urea_concern"),
            ("sand_silica_concern_score", "sand_silica_concern"),
            ("aflatoxin_concern_score", "aflatoxin_concern"),
            ("fungal_concern_score", "fungal_concern"),
        ):
            value = getattr(extra, field)
            if value is not None:
                parameters[field] = value
                signals.append(CapabilitySignal(code=code, status="review_required"))

    return AnalysisResult(
        id=str(uuid4()), created_at=datetime.now(timezone.utc), sample_type=req.sample_type,
        quality_score=round(score, 1), confidence=round(confidence, 1), risk_level=risk,
        parameters=parameters, anomalies=anomalies, advisory=advisory, capability_signals=signals,
    )
