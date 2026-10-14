from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

BG_DARK = RGBColor(0x0B, 0x1D, 0x33)
BG_MED = RGBColor(0x11, 0x2B, 0x45)
GRN = RGBColor(0x00, 0xC9, 0x7B)
BLU = RGBColor(0x00, 0x96, 0xD6)
ORG = RGBColor(0xFF, 0x8C, 0x00)
RED = RGBColor(0xE8, 0x3E, 0x3E)
WHT = RGBColor(0xFF, 0xFF, 0xFF)
LGT = RGBColor(0xCC, 0xCC, 0xCC)
GRY = RGBColor(0x99, 0x99, 0x99)
YLW = RGBColor(0xFF, 0xD7, 0x00)
DARK_BG = RGBColor(0x06, 0x12, 0x22)
CARD_BG = RGBColor(0x0A, 0x20, 0x35)

TOTAL = 42

def bg(s, c=BG_DARK):
    f = s.background.fill; f.solid(); f.fore_color.rgb = c

def rect(s, l, t, w, h, c):
    sh = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, l, t, w, h)
    sh.fill.solid(); sh.fill.fore_color.rgb = c; sh.line.fill.background()
    return sh

def txt(s, l, t, w, h, text, sz=18, c=WHT, b=False, al=PP_ALIGN.LEFT):
    tb = s.shapes.add_textbox(l, t, w, h)
    tf = tb.text_frame; tf.word_wrap = True
    p = tf.paragraphs[0]; p.text = text
    p.font.size = Pt(sz); p.font.color.rgb = c; p.font.bold = b
    p.font.name = "Calibri"; p.alignment = al
    return tb

def bullets(s, l, t, w, h, items, sz=14, c=LGT):
    tb = s.shapes.add_textbox(l, t, w, h)
    tf = tb.text_frame; tf.word_wrap = True
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text = item; p.font.size = Pt(sz); p.font.color.rgb = c
        p.font.name = "Calibri"; p.space_after = Pt(6)
    return tb

def line(s, l, t, w, c=GRN):
    rect(s, l, t, w, Pt(4), c)

def card(s, l, t, w, h, title, items, tc=GRN, cc=LGT):
    rect(s, l, t, w, h, BG_MED)
    txt(s, l+Inches(0.2), t+Inches(0.15), w-Inches(0.4), Inches(0.35), title, 14, tc, True)
    y = t + Inches(0.55)
    for item in items:
        txt(s, l+Inches(0.2), y, w-Inches(0.4), Inches(0.25), item, 11, cc)
        y += Inches(0.25)

def sn(s, text):
    s.notes_slide.notes_text_frame.text = text

def num(s, n):
    txt(s, Inches(12.3), Inches(7.0), Inches(0.9), Inches(0.4), f"{n}/{TOTAL}", 10, GRY, al=PP_ALIGN.RIGHT)

def header(s, t, sub=""):
    txt(s, Inches(0.8), Inches(0.3), Inches(11), Inches(0.6), t, 32, WHT, True)
    line(s, Inches(0.8), Inches(0.95), Inches(2.5))
    if sub:
        txt(s, Inches(0.8), Inches(1.1), Inches(11), Inches(0.4), sub, 16, GRY)

# ========== SLIDE 1: TITLE ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s, DARK_BG)
rect(s, Inches(0), Inches(0), Inches(0.15), Inches(7.5), GRN)
txt(s, Inches(1), Inches(1.2), Inches(11), Inches(1.0), "FEEDIQ", 60, GRN, True)
txt(s, Inches(1), Inches(2.3), Inches(11), Inches(0.8), "AI-Powered Smart Feed Quality Analysis System", 28, WHT, True)
line(s, Inches(1), Inches(3.2), Inches(4))
txt(s, Inches(1), Inches(3.5), Inches(11), Inches(0.6), "Real-Time Nutritional Profiling, Contamination Detection & Advisory", 18, LGT)
txt(s, Inches(1), Inches(4.5), Inches(11), Inches(0.5), "Smart India Hackathon 2026 | Grand Finale Submission", 16, YLW, True)
txt(s, Inches(1), Inches(5.3), Inches(5), Inches(0.4), "Problem Statement ID: SIH-2026-FEED-001", 14, GRY)
txt(s, Inches(1), Inches(5.7), Inches(5), Inches(0.4), "Domain: Agriculture & Animal Husbandry", 14, GRY)
txt(s, Inches(1), Inches(6.1), Inches(5), Inches(0.4), "Theme: AI/ML for Quality Assurance", 14, GRY)
rect(s, Inches(9), Inches(4.5), Inches(4), Inches(2.5), CARD_BG)
txt(s, Inches(9.3), Inches(4.7), Inches(3.5), Inches(0.4), "TEAM NAME", 12, GRY, True)
txt(s, Inches(9.3), Inches(5.1), Inches(3.5), Inches(0.5), "FeedIQ Innovators", 20, GRN, True)
txt(s, Inches(9.3), Inches(5.7), Inches(3.5), Inches(0.3), "Institution: [Your College Name]", 12, LGT)
txt(s, Inches(9.3), Inches(6.1), Inches(3.5), Inches(0.3), "Mentor: [Mentor Name]", 12, LGT)
num(s, 1)
sn(s, "Welcome everyone. We are Team FeedIQ Innovators presenting FeedIQ - an AI-powered smart feed quality analysis system for Indian agriculture.")

# ========== SLIDE 2: PROBLEM STATEMENT ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Problem Statement", "Why does this matter?")
rect(s, Inches(0.8), Inches(1.6), Inches(11.7), Inches(1.6), RGBColor(0x1A, 0x0A, 0x0A))
txt(s, Inches(1), Inches(1.7), Inches(11.3), Inches(1.4), "Livestock feed adulteration and nutritional imbalance cause annual losses exceeding Rs. 50,000 crore in India, directly impacting milk production, meat quality, and farmer livelihoods. Current testing methods are lab-dependent, expensive (Rs. 2,000-5,000 per test), and take 3-7 days.", 15, ORG)
txt(s, Inches(0.8), Inches(3.4), Inches(5.5), Inches(0.4), "Core Problem Areas", 20, GRN, True)
bullets(s, Inches(0.8), Inches(3.9), Inches(5.5), Inches(3.0), [
    "60% of commercial cattle feed in India is adulterated",
    "Farmers cannot verify feed quality at point of purchase",
    "Lab testing takes 3-7 days - too slow for daily decisions",
    "Aflatoxin contamination causes Rs. 900 Cr annual losses",
    "Nutritional imbalance reduces milk yield by 15-25%",
    "No portable, affordable, real-time testing solution exists"
], 13)
rect(s, Inches(7), Inches(3.4), Inches(5.5), Inches(3.2), BG_MED)
txt(s, Inches(7.3), Inches(3.5), Inches(5), Inches(0.4), "Impact Statistics", 18, YLW, True)
stats = [("Rs. 50,000 Cr", "Annual loss due to feed quality"), ("3-7 Days", "Current lab testing turnaround"), ("Rs. 2,000-5,000", "Cost per lab test"), ("15-25%", "Milk yield reduction"), ("60%", "Feed adulteration rate"), ("70M+", "Small farmers affected")]
y = Inches(4.0)
for v, d in stats:
    txt(s, Inches(7.3), y, Inches(2.2), Inches(0.3), v, 15, GRN, True)
    txt(s, Inches(9.5), y, Inches(3), Inches(0.3), d, 11, LGT)
    y += Inches(0.35)
num(s, 2)
sn(s, "The problem is massive. Rs. 50,000 crore annual losses. 60% of feed is adulterated. Current testing is too slow and expensive.")

# ========== SLIDE 3: BACKGROUND ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Background & Context", "Understanding the ecosystem")
card(s, Inches(0.8), Inches(1.6), Inches(3.7), Inches(2.5), "Indian Dairy Industry", ["World's largest milk producer", "Rs. 9 lakh crore dairy market", "80M+ dairy farmers", "Feed cost: 60-70% of expense", "Quality feed = more milk"], tc=BLU)
card(s, Inches(4.8), Inches(1.6), Inches(3.7), Inches(2.5), "Feed Testing Landscape", ["Limited testing infrastructure", "NABL labs in urban areas only", "No portable field testing", "Farmers rely on visual check", "Unregulated feed market"], tc=ORG)
card(s, Inches(8.8), Inches(1.6), Inches(3.7), Inches(2.5), "Technology Gap", ["NIR not used at field level", "No AI-based feed systems", "IoT in agriculture: <5% adoption", "CV for food safety: nascent", "Edge AI: emerging"], tc=GRN)
txt(s, Inches(0.8), Inches(4.4), Inches(11.7), Inches(0.4), "Government Initiatives Aligned", 18, YLW, True)
bullets(s, Inches(0.8), Inches(4.9), Inches(11.7), Inches(2.0), [
    "National Dairy Plan - Quality improvement focus",
    "PM-KISAN - Farmer welfare technology | Digital India - Agricultural digitization",
    "Startup India - Agritech innovation | National Animal Nutrition Project",
    "Ministry of Fisheries, Animal Husbandry & Dairying priority alignment"
], 13)
num(s, 3)
sn(s, "India is world's largest milk producer. Rs. 9 lakh crore market. Feed cost is 60-70%. But testing infrastructure is severely lacking.")

# ========== SLIDE 4: EXISTING CHALLENGES ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Existing Challenges", "Why current solutions fail")
challenges = [
    ("Lab-Dependent Testing", "Centralized NABL labs require sample transport. 3-7 day turnaround.", RED),
    ("High Cost Barrier", "Rs. 2,000-5,000 per test makes routine checks unaffordable.", ORG),
    ("No Field Solutions", "Zero portable, real-time feed testing devices in Indian market.", YLW),
    ("Knowledge Gap", "Farmers lack technical knowledge to assess feed quality.", BLU),
    ("Regulatory Vacuum", "No mandatory quality certification for 70% manufacturers.", GRN),
    ("Fragmented Data", "No centralized database of feed quality parameters.", LGT),
]
for i, (t, d, c) in enumerate(challenges):
    r, co = i//3, i%3
    x, y = Inches(0.8+co*4.1), Inches(1.6+r*2.8)
    rect(s, x, y, Inches(3.8), Inches(2.4), BG_MED)
    rect(s, x+Inches(0.15), y+Inches(0.15), Inches(0.5), Inches(0.5), c)
    txt(s, x+Inches(0.2), y+Inches(0.17), Inches(0.45), Inches(0.45), str(i+1), 18, BG_DARK, True, PP_ALIGN.CENTER)
    txt(s, x+Inches(0.8), y+Inches(0.2), Inches(2.8), Inches(0.3), t, 15, c, True)
    txt(s, x+Inches(0.2), y+Inches(0.75), Inches(3.4), Inches(1.5), d, 12, LGT)
num(s, 4)
sn(s, "Six critical challenges. Lab dependency, high costs, no field solutions, knowledge gaps, regulatory vacuum, and fragmented data.")

# ========== SLIDE 5: PROBLEM ANALYSIS ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Problem Analysis", "Multi-dimensional breakdown")
dims = [
    ("Technical Dimension", GRN, ["No real-time spectral analysis at field level", "Absence of trained ML models for Indian feed types", "Lack of integrated sensor fusion platforms", "Edge computing not deployed for agricultural QA"]),
    ("Economic Dimension", ORG, ["Testing cost exceeds daily feed budget", "No ROI model for quality testing investment", "Adulteration profit motive remains unchecked", "Market favors cheap, low-quality feed"]),
    ("Social Dimension", BLU, ["Farmer literacy barriers to tech adoption", "Trust deficit in automated systems", "Language limitations in advisory delivery", "Rural connectivity and power constraints"]),
    ("Regulatory Dimension", YLW, ["No mandatory testing for small manufacturers", "Weak enforcement of BIS standards", "No digital traceability in supply chain", "Cross-state regulatory inconsistencies"]),
]
for i, (t, c, items) in enumerate(dims):
    r, co = i//2, i%2
    x, y = Inches(0.8+co*6.2), Inches(1.6+r*2.8)
    rect(s, x, y, Inches(5.7), Inches(2.5), BG_MED)
    txt(s, x+Inches(0.2), y+Inches(0.15), Inches(5), Inches(0.35), t, 17, c, True)
    bullets(s, x+Inches(0.2), y+Inches(0.55), Inches(5.3), Inches(1.8), items, 12)
num(s, 5)
sn(s, "Four dimensions - technical, economic, social, and regulatory. Each has multiple root causes requiring simultaneous solutions.")

# ========== SLIDE 6: ROOT CAUSES ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Root Cause Analysis", "Ishikawa breakdown")
causes = [
    ("TECHNOLOGY", GRN, ["No portable NIR devices", "Missing ML models for Indian feeds", "No IoT integration"]),
    ("INFRASTRUCTURE", BLU, ["Limited rural connectivity", "No testing labs near farms", "Power availability issues"]),
    ("KNOWLEDGE", ORG, ["Low farmer digital literacy", "No quality training", "Language barriers"]),
    ("MARKET", YLW, ["Price-driven purchasing", "No quality certification", "Unorganized manufacturers"]),
    ("POLICY", RED, ["Weak enforcement", "No mandatory testing laws", "Missing traceability"]),
    ("DATA", LGT, ["No centralized database", "No spectral reference libs", "No historical tracking"]),
]
for i, (cat, c, items) in enumerate(causes):
    r, co = i//3, i%3
    x, y = Inches(0.8+co*4.1), Inches(1.6+r*2.8)
    rect(s, x, y, Inches(3.8), Inches(2.4), BG_MED)
    txt(s, x+Inches(0.2), y+Inches(0.15), Inches(3.4), Inches(0.3), cat, 14, c, True)
    line(s, x+Inches(0.2), y+Inches(0.5), Inches(3.4), c)
    for j, item in enumerate(items):
        txt(s, x+Inches(0.3), y+Inches(0.65+j*0.5), Inches(3.2), Inches(0.4), item, 12, LGT)
num(s, 6)
sn(s, "Six root cause categories through Ishikawa analysis. Technology gaps, infrastructure deficits, knowledge barriers, market failures, policy gaps, and data voids.")

# ========== SLIDE 7: STAKEHOLDERS ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Stakeholder Analysis", "Who is affected and who can help")
stakeholders = [
    ("Primary Users", "Small & Medium Dairy Farmers", "Direct beneficiaries. Need affordable, real-time testing. Currently have zero quality verification.", GRN),
    ("Secondary Users", "Feed Manufacturers & Suppliers", "Quality certification. Brand trust. Regulatory compliance.", BLU),
    ("Regulators", "FSSAI / BIS / State Depts", "Enforcement data. Compliance monitoring. Standards enforcement.", ORG),
    ("Beneficiaries", "Livestock (Cattle, Poultry, Fish)", "Better nutrition. Reduced toxin exposure. Improved health.", YLW),
    ("Enablers", "Agri-Tech Companies", "Distribution channels. Technology integration. Service delivery.", LGT),
    ("Policy Makers", "Ministry of AHD", "Data-driven policy. Impact assessment. Program optimization.", RED),
]
for i, (cat, name, desc, c) in enumerate(stakeholders):
    r, co = i//3, i%3
    x, y = Inches(0.8+co*4.1), Inches(1.6+r*2.8)
    rect(s, x, y, Inches(3.8), Inches(2.4), BG_MED)
    rect(s, x, y, Inches(3.8), Inches(0.06), c)
    txt(s, x+Inches(0.2), y+Inches(0.2), Inches(3.4), Inches(0.25), cat, 11, c, True)
    txt(s, x+Inches(0.2), y+Inches(0.5), Inches(3.4), Inches(0.3), name, 14, WHT, True)
    txt(s, x+Inches(0.2), y+Inches(0.9), Inches(3.4), Inches(1.3), desc, 11, LGT)
num(s, 7)
sn(s, "Six stakeholder groups. Primary users are small dairy farmers with no way to verify feed quality currently.")

# ========== SLIDE 8: OBJECTIVES ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Project Objectives", "What we aim to achieve")
objs = [
    ("Real-Time Testing", "Portable device providing results in under 60 seconds.", "60s", GRN),
    ("Affordable QA", "Testing cost below Rs. 50 per analysis.", "Rs.50", BLU),
    ("AI-Powered Accuracy", ">95% accuracy in nutrition and contamination detection.", "95%+", ORG),
    ("Multi-Parameter", "Protein, fiber, energy, moisture + 15 contaminants.", "15+", YLW),
    ("Farmer Advisory", "Actionable vernacular recommendations.", "Multi-lang", LGT),
    ("Data Ecosystem", "India's first comprehensive feed quality database.", "1st", RED),
]
for i, (t, d, m, c) in enumerate(objs):
    r, co = i//3, i%3
    x, y = Inches(0.8+co*4.1), Inches(1.6+r*2.8)
    rect(s, x, y, Inches(3.8), Inches(2.4), BG_MED)
    rect(s, x+Inches(2.7), y+Inches(0.15), Inches(0.9), Inches(0.5), c)
    txt(s, x+Inches(2.75), y+Inches(0.17), Inches(0.85), Inches(0.45), m, 13, BG_DARK, True, PP_ALIGN.CENTER)
    txt(s, x+Inches(0.2), y+Inches(0.2), Inches(2.4), Inches(0.3), t, 15, c, True)
    txt(s, x+Inches(0.2), y+Inches(0.7), Inches(3.4), Inches(1.5), d, 12, LGT)
num(s, 8)
sn(s, "Six measurable objectives. Real-time 60s testing, Rs. 50 cost, 95%+ accuracy, multi-parameter, vernacular advisory, and India's first feed quality database.")

# ========== SLIDE 9: SOLUTION OVERVIEW ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Proposed Solution - Overview", "FeedIQ: End-to-end smart feed quality platform")
layers = [
    ("LAYER 4: Farmer Interface", "Mobile App + Dashboard | Vernacular Advisory | Real-time Alerts | Historical Tracking", GRN, Inches(1.7)),
    ("LAYER 3: Cloud Intelligence", "AWS IoT Core + Firebase | ML Training | Data Analytics | API Gateway", BLU, Inches(2.8)),
    ("LAYER 2: Edge AI Processing", "Raspberry Pi 5 / Jetson | TensorFlow Lite | On-device Inference | Local Storage", ORG, Inches(3.9)),
    ("LAYER 1: Sensor Array", "NIR Spectrometer (128-pt) | CV Camera | Moisture/Temp Biosensors | Gas Sensors", YLW, Inches(5.0)),
]
for t, d, c, y in layers:
    rect(s, Inches(1.0), y, Inches(11.3), Inches(0.9), CARD_BG)
    rect(s, Inches(1.0), y, Inches(0.08), Inches(0.9), c)
    txt(s, Inches(1.3), y+Inches(0.08), Inches(3.5), Inches(0.3), t, 14, c, True)
    txt(s, Inches(1.3), y+Inches(0.45), Inches(10.8), Inches(0.3), d, 12, LGT)
txt(s, Inches(1.2), Inches(6.1), Inches(10.8), Inches(0.5), "Data Flow: Sensors -> Edge AI -> Cloud -> Mobile App -> Farmer Advisory", 13, GRY, al=PP_ALIGN.CENTER)
num(s, 9)
sn(s, "Four-layer architecture. Sensors -> Edge AI -> Cloud -> Farmer Interface. Data flows from sensors through processing to deliver actionable advice.")

# ========== SLIDE 10: METHODOLOGY ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Complete Methodology", "Phase-wise approach")
phases = [
    ("Phase 1", "Research & Design", "Month 1-2", "Literature review. Sensor selection. Model architecture. UI/UX wireframing. Hardware prototyping.", GRN),
    ("Phase 2", "Development", "Month 3-5", "Sensor integration. ML model training. Edge deployment. Mobile app. Cloud setup.", BLU),
    ("Phase 3", "Testing & Validation", "Month 6-7", "Lab validation. Field trials with 50 farmers. Accuracy benchmarking. Optimization.", ORG),
    ("Phase 4", "Deployment & Scaling", "Month 8-12", "Pilot in 3 districts. Feedback integration. Scale to 1000 devices. Partnerships.", YLW),
]
for i, (ph, nm, tl, d, c) in enumerate(phases):
    x = Inches(0.8+i*3.1)
    rect(s, x, Inches(1.6), Inches(2.8), Inches(5.0), BG_MED)
    rect(s, x, Inches(1.6), Inches(2.8), Inches(0.06), c)
    txt(s, x+Inches(0.15), Inches(1.8), Inches(2.5), Inches(0.25), ph, 12, c, True)
    txt(s, x+Inches(0.15), Inches(2.1), Inches(2.5), Inches(0.4), nm, 18, WHT, True)
    txt(s, x+Inches(0.15), Inches(2.55), Inches(2.5), Inches(0.25), tl, 12, c)
    line(s, x+Inches(0.15), Inches(2.85), Inches(2.5), c)
    txt(s, x+Inches(0.15), Inches(3.05), Inches(2.5), Inches(3.2), d, 12, LGT)
num(s, 10)
sn(s, "Four phases over 12 months. Research/design, development, testing/validation, and deployment/scaling.")

# ========== SLIDE 11: WORKFLOW ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "System Workflow", "Step-by-step process flow")
steps = [
    ("1", "SAMPLE\nCOLLECTION", "Feed sample\ninserted", GRN),
    ("2", "SENSOR\nREADING", "NIR + Camera +\nBiosensors", BLU),
    ("3", "EDGE AI\nPROCESSING", "On-device ML\ninference", ORG),
    ("4", "CLOUD\nSYNC", "Data upload to\nAWS IoT", YLW),
    ("5", "ANALYSIS\nREPORT", "Quality report\ngenerated", GRN),
    ("6", "ADVISORY\nALERT", "Actionable\nadvice sent", BLU),
]
for i, (n, t, d, c) in enumerate(steps):
    x = Inches(0.5+i*2.1)
    rect(s, x, Inches(2.2), Inches(1.8), Inches(3.5), BG_MED)
    rect(s, x+Inches(0.65), Inches(2.4), Inches(0.5), Inches(0.5), c)
    txt(s, x+Inches(0.65), Inches(2.42), Inches(0.5), Inches(0.45), n, 20, BG_DARK, True, PP_ALIGN.CENTER)
    txt(s, x+Inches(0.1), Inches(3.1), Inches(1.6), Inches(0.7), t, 12, c, True, PP_ALIGN.CENTER)
    txt(s, x+Inches(0.1), Inches(3.9), Inches(1.6), Inches(0.7), d, 11, LGT, al=PP_ALIGN.CENTER)
    if i < 5:
        txt(s, x+Inches(1.8), Inches(3.5), Inches(0.3), Inches(0.4), ">", 24, GRY, True, PP_ALIGN.CENTER)
txt(s, Inches(0.8), Inches(6.0), Inches(11.7), Inches(0.5), "Total Processing Time: < 60 seconds from sample to advisory", 16, GRN, True, PP_ALIGN.CENTER)
num(s, 11)
sn(s, "Six-step workflow completing in under 60 seconds. Sample collection, sensor reading, edge AI, cloud sync, report, advisory.")

# ========== SLIDE 12: AI PIPELINE ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "AI/ML Pipeline", "Intelligence at the edge and cloud")
rect(s, Inches(0.8), Inches(1.6), Inches(5.5), Inches(5.2), BG_MED)
txt(s, Inches(1), Inches(1.75), Inches(5), Inches(0.35), "Data Ingestion & Preprocessing", 15, GRN, True)
bullets(s, Inches(1), Inches(2.15), Inches(5.2), Inches(1.0), [
    "128-point NIR spectral normalization",
    "Image preprocessing (resize, normalize, augment)",
    "Biosensor data calibration and smoothing",
    "Feature extraction (PCA, spectral indices)"
], 12)
txt(s, Inches(1), Inches(3.2), Inches(5), Inches(0.35), "Model Training (Cloud)", 15, BLU, True)
bullets(s, Inches(1), Inches(3.6), Inches(5.2), Inches(1.2), [
    "PLS Regression for nutrition prediction",
    "Random Forest for multi-parameter analysis",
    "YOLOv8/MobileNet for contamination detection",
    "XGBoost for adulteration classification",
    "Transfer learning with domain fine-tuning"
], 12)
txt(s, Inches(1), Inches(4.9), Inches(5), Inches(0.35), "Edge Deployment", 15, ORG, True)
bullets(s, Inches(1), Inches(5.3), Inches(5.2), Inches(1.0), [
    "TensorFlow Lite quantized models",
    "ONNX Runtime for cross-platform inference",
    "Model size: <50MB per model",
    "Inference time: <2 seconds per model"
], 12)
rect(s, Inches(6.6), Inches(1.6), Inches(5.9), Inches(5.2), BG_MED)
txt(s, Inches(6.8), Inches(1.75), Inches(5.5), Inches(0.35), "Model Specifications", 15, YLW, True)
models = [
    ("NIR Nutrition Model", "PLS + RF Ensemble | 128->3 nutrients"),
    ("Contamination CNN", "MobileNetV3 | 224x224x3 -> classes"),
    ("Adulteration Classifier", "XGBoost | 50 features -> 5 classes"),
    ("Quality Scorer", "Gradient Boosting -> 0-100 score"),
    ("Anomaly Detector", "Isolation Forest | Unsupervised"),
    ("Advisor Engine", "Rule-based + LLM | -> farmer advisory"),
]
y = Inches(2.2)
for nm, d in models:
    rect(s, Inches(6.8), y, Inches(5.5), Inches(0.7), CARD_BG)
    txt(s, Inches(7), y+Inches(0.05), Inches(5.1), Inches(0.25), nm, 12, GRN, True)
    txt(s, Inches(7), y+Inches(0.35), Inches(5.1), Inches(0.25), d, 10, LGT)
    y += Inches(0.76)
num(s, 12)
sn(s, "AI pipeline with PLS, Random Forest, YOLOv8, and XGBoost. Edge deployment uses TensorFlow Lite with <50MB models.")

# ========== SLIDE 13: HARDWARE ARCHITECTURE ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Hardware Architecture", "Complete system design")
rect(s, Inches(0.8), Inches(1.6), Inches(5.5), Inches(5.2), BG_MED)
txt(s, Inches(1), Inches(1.75), Inches(5), Inches(0.35), "Sensor Array", 15, GRN, True)
sensors = [("NIR Spectrometer", "128-pt (900-1700nm)", "I2C/SPI"), ("Macro Camera", "12MP Sony IMX477", "CSI"), ("Moisture Sensor", "Capacitive 0-100%", "ADC"), ("Temperature", "DHT22 (-40-80C)", "GPIO"), ("Gas Sensor", "MQ-137 Ammonia", "ADC"), ("Load Cell", "HX711 (0-10kg)", "SPI")]
y = Inches(2.2)
for nm, sp, itf in sensors:
    rect(s, Inches(1), y, Inches(5.1), Inches(0.5), CARD_BG)
    txt(s, Inches(1.2), y+Inches(0.05), Inches(2), Inches(0.2), nm, 11, GRN, True)
    txt(s, Inches(1.2), y+Inches(0.25), Inches(2), Inches(0.2), sp, 10, LGT)
    txt(s, Inches(3.5), y+Inches(0.1), Inches(2.3), Inches(0.25), itf, 10, GRY)
    y += Inches(0.55)
rect(s, Inches(6.6), Inches(1.6), Inches(5.9), Inches(5.2), BG_MED)
txt(s, Inches(6.8), Inches(1.75), Inches(5.5), Inches(0.35), "Processing Unit", 15, BLU, True)
bullets(s, Inches(6.8), Inches(2.2), Inches(5.5), Inches(2.0), [
    "Primary: Raspberry Pi 5 (8GB RAM)",
    "Alternative: NVIDIA Jetson Nano",
    "Storage: 256GB NVMe SSD",
    "Connectivity: WiFi + 4G LTE + BLE",
    "Power: 12V DC (Battery: 4 hours)",
    "Enclosure: IP54 rated for farm use",
    "Display: 7-inch touchscreen (optional)",
    "Interface: USB-C sensor hub connection"
], 13)
txt(s, Inches(6.8), Inches(4.3), Inches(5.5), Inches(0.35), "BOM Cost Estimate", 15, ORG, True)
bom = [("RPi 5 (8GB)", "Rs. 8,500"), ("NIR Module", "Rs. 15,000"), ("Camera", "Rs. 3,500"), ("Sensors", "Rs. 2,500"), ("PCB + Enclosure", "Rs. 4,500"), ("Battery + Power", "Rs. 2,000"), ("TOTAL BOM", "Rs. 36,000")]
y = Inches(4.75)
for it, ct in bom:
    c2 = YLW if "TOTAL" in it else LGT
    b2 = "TOTAL" in it
    txt(s, Inches(6.8), y, Inches(3.5), Inches(0.25), it, 11, c2, b2)
    txt(s, Inches(10.5), y, Inches(2), Inches(0.25), ct, 11, c2, b2, PP_ALIGN.RIGHT)
    y += Inches(0.28)
num(s, 13)
sn(s, "Hardware includes 6 sensors, Raspberry Pi 5, and connectivity modules. Total BOM Rs. 36,000 per unit.")

# ========== SLIDE 14: SOFTWARE ARCHITECTURE ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Software Architecture", "Full-stack system design")
sw_layers = [
    ("Presentation Layer", "React Native Mobile App | React.js Web Dashboard | Farmer-friendly UI", GRN, Inches(1.7)),
    ("API Gateway", "REST + GraphQL | JWT Auth | Rate Limiting | API Versioning", BLU, Inches(2.7)),
    ("Application Layer", "Node.js/Express Backend | Python AI Service | WebSocket Real-time", ORG, Inches(3.7)),
    ("AI/ML Layer", "TensorFlow Lite (Edge) | PyTorch (Cloud) | MLflow Model Registry", YLW, Inches(4.7)),
    ("Data Layer", "PostgreSQL (Structured) | MongoDB (Spectral) | Redis (Cache) | S3 (Images)", LGT, Inches(5.7)),
]
for t, d, c, y in sw_layers:
    rect(s, Inches(0.8), y, Inches(11.7), Inches(0.85), BG_MED)
    rect(s, Inches(0.8), y, Inches(0.06), Inches(0.85), c)
    txt(s, Inches(1.1), y+Inches(0.08), Inches(3.5), Inches(0.3), t, 14, c, True)
    txt(s, Inches(1.1), y+Inches(0.4), Inches(11.2), Inches(0.3), d, 12, LGT)
num(s, 14)
sn(s, "Five-layer software architecture from presentation to data layer with specific technology choices for each.")

# ========== SLIDE 15: MOBILE APP ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Mobile App Features", "Farmer-centric design")
features = [
    ("One-Tap Analysis", "Connect device, tap analyze, results in 60s. No technical knowledge needed.", GRN),
    ("Visual Dashboard", "Color-coded quality scores. Traffic light system (Green/Amber/Red).", BLU),
    ("Vernacular Advisory", "Recommendations in Hindi, Tamil, Telugu, Marathi, Gujarati, Kannada, Bengali.", ORG),
    ("Historical Tracking", "Track quality over time. Identify seasonal patterns. Compare batches.", YLW),
    ("Price Comparison", "Quality-adjusted price comparison. Best value recommendations.", LGT),
    ("Alert System", "Contamination alerts. Moisture warnings. Reorder reminders.", RED),
]
for i, (t, d, c) in enumerate(features):
    r, co = i//3, i%3
    x, y = Inches(0.8+co*4.1), Inches(1.6+r*2.8)
    rect(s, x, y, Inches(3.8), Inches(2.4), BG_MED)
    rect(s, x, y, Inches(3.8), Inches(0.06), c)
    txt(s, x+Inches(0.2), y+Inches(0.2), Inches(3.4), Inches(0.3), t, 16, c, True)
    txt(s, x+Inches(0.2), y+Inches(0.7), Inches(3.4), Inches(1.5), d, 12, LGT)
num(s, 15)
sn(s, "Six mobile app features. One-tap analysis, visual dashboard, 7 languages, history, price comparison, alerts.")

# ========== SLIDE 16: FARMER DASHBOARD ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Farmer Dashboard", "Intuitive interface for rural users")
rect(s, Inches(0.8), Inches(1.6), Inches(7.5), Inches(5.2), BG_MED)
txt(s, Inches(1), Inches(1.75), Inches(7), Inches(0.35), "Dashboard Components", 16, GRN, True)
comps = [
    ("Quality Score Card", "Overall score 0-100 with color coding"),
    ("Nutrition Panel", "Protein, Fiber, Energy as easy gauges"),
    ("Safety Status", "Traffic light for immediate action"),
    ("Advisory Feed", "Recommendations and supplement suggestions"),
    ("History Graph", "Quality trends over weeks/months"),
    ("Scan History", "All previous scans with timestamps"),
]
y = Inches(2.2)
for t, d in comps:
    rect(s, Inches(1), y, Inches(7.1), Inches(0.65), CARD_BG)
    txt(s, Inches(1.2), y+Inches(0.05), Inches(2.5), Inches(0.25), t, 12, GRN, True)
    txt(s, Inches(1.2), y+Inches(0.32), Inches(6.7), Inches(0.25), d, 10, LGT)
    y += Inches(0.72)
rect(s, Inches(8.6), Inches(1.6), Inches(3.9), Inches(5.2), BG_MED)
txt(s, Inches(8.8), Inches(1.75), Inches(3.5), Inches(0.35), "Design Principles", 15, BLU, True)
princ = ["Large touch targets (min 48px)", "High contrast for outdoor use", "Minimal text, maximum icons", "Voice feedback option", "Offline-first architecture", "Auto-sync when connected", "One-handed operation", "Emergency alert overlay"]
for i, p in enumerate(princ):
    txt(s, Inches(8.8), Inches(2.2)+Inches(i*0.45), Inches(3.5), Inches(0.3), p, 11, LGT)
num(s, 16)
sn(s, "Farmer dashboard with 6 components. Design follows rural usability principles with large targets, high contrast, offline-first.")

# ========== SLIDE 17: ADMIN DASHBOARD ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Admin Dashboard", "Fleet management and analytics")
admin = [
    ("Device Fleet Management", "Monitor all devices. Health status. Firmware updates. Remote diagnostics.", GRN),
    ("Regional Analytics", "District-level quality heatmaps. Contamination hotspots. Trend analysis.", BLU),
    ("Manufacturer Compliance", "Brand quality tracking. Compliance scoring. Violation alerts.", ORG),
    ("Data Export & Reports", "Government reports. CSV/Excel export. Scheduled reports. API access.", YLW),
    ("User Management", "Farmer registration. Device assignment. Role-based access. Support tickets.", LGT),
    ("ML Model Management", "Model versioning. A/B testing. Performance monitoring. Retraining.", RED),
]
for i, (t, d, c) in enumerate(admin):
    r, co = i//3, i%3
    x, y = Inches(0.8+co*4.1), Inches(1.6+r*2.8)
    rect(s, x, y, Inches(3.8), Inches(2.4), BG_MED)
    rect(s, x, y, Inches(3.8), Inches(0.06), c)
    txt(s, x+Inches(0.2), y+Inches(0.2), Inches(3.4), Inches(0.3), t, 14, c, True)
    txt(s, x+Inches(0.2), y+Inches(0.7), Inches(3.4), Inches(1.5), d, 12, LGT)
num(s, 17)
sn(s, "Admin dashboard provides device fleet management, regional analytics, manufacturer compliance, data export, user management, and ML model management.")

# ========== SLIDE 18: SENSOR INTEGRATION ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Sensor Integration Details", "Multi-sensor fusion approach")
sensor_det = [
    ("NIR Spectrometer", "Near-infrared spectroscopy (900-1700nm) for molecular bond analysis. Detects protein (N-H bonds), fiber (C-H, O-H), moisture (O-H), and fat through spectral reflectance. 128-point resolution.", GRN),
    ("Computer Vision Camera", "12MP macro camera captures feed surface images. Detects visible adulterants (sand, stones, plastic), color variations, mold/fungus growth patterns, and particle size distribution.", BLU),
    ("Biosensor Array", "Capacitive moisture sensor (0-100%, +/-2%). DHT22 temperature/humidity. MQ-137 ammonia gas sensor. Load cell for precise sample weighing (0-10kg, 0.1g resolution).", ORG),
]
for i, (t, d, c) in enumerate(sensor_det):
    y = Inches(1.6)+Inches(i*1.8)
    rect(s, Inches(0.8), y, Inches(11.7), Inches(1.6), BG_MED)
    rect(s, Inches(0.8), y, Inches(0.06), Inches(1.6), c)
    txt(s, Inches(1.1), y+Inches(0.1), Inches(3), Inches(0.3), t, 16, c, True)
    txt(s, Inches(1.1), y+Inches(0.5), Inches(11.2), Inches(1.0), d, 12, LGT)
txt(s, Inches(0.8), Inches(6.6), Inches(11.7), Inches(0.4), "Sensor Fusion: All data synchronized with timestamps into unified feature vectors for ML inference.", 13, GRY, al=PP_ALIGN.CENTER)
num(s, 18)
sn(s, "Three sensor categories. NIR for molecular analysis, CV for visual inspection, biosensors for physical parameters. All fused into unified feature vectors.")

# ========== SLIDE 19: CV MODULE ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Computer Vision Module", "Visual adulteration detection")
rect(s, Inches(0.8), Inches(1.6), Inches(5.5), Inches(5.2), BG_MED)
txt(s, Inches(1), Inches(1.75), Inches(5), Inches(0.35), "Detection Capabilities", 15, GRN, True)
cv_caps = ["Visible adulterant detection (sand, stones, plastic)", "Color anomaly detection", "Mold/fungus identification", "Particle size distribution analysis", "Texture analysis for consistency", "Foreign object detection", "Moisture damage patterns", "Packaging integrity check"]
bullets(s, Inches(1), Inches(2.2), Inches(5.2), Inches(4.0), cv_caps, 12)
rect(s, Inches(6.6), Inches(1.6), Inches(5.9), Inches(5.2), BG_MED)
txt(s, Inches(6.8), Inches(1.75), Inches(5.5), Inches(0.35), "Technical Pipeline", 15, BLU, True)
cv_pipe = [("Image Capture", "12MP macro, LED lighting, auto-focus"), ("Preprocessing", "Resize 224x224, normalize, augment"), ("Feature Extraction", "MobileNetV3 backbone, transfer learning"), ("Detection Head", "YOLOv8-nano for object detection"), ("Classification", "CNN for contamination type"), ("Post-processing", "NMS, confidence thresholding")]
y = Inches(2.2)
for stg, d in cv_pipe:
    rect(s, Inches(6.8), y, Inches(5.5), Inches(0.65), CARD_BG)
    txt(s, Inches(7), y+Inches(0.05), Inches(2.5), Inches(0.2), stg, 11, BLU, True)
    txt(s, Inches(7), y+Inches(0.3), Inches(5.1), Inches(0.25), d, 10, LGT)
    y += Inches(0.7)
num(s, 19)
sn(s, "Computer vision detects 8 types of visual adulterants. MobileNetV3 backbone with YOLOv8-nano head. Inference under 500ms.")

# ========== SLIDE 20: SPECTROSCOPY MODULE ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Spectroscopy Module", "NIR-based nutritional analysis")
rect(s, Inches(0.8), Inches(1.6), Inches(5.5), Inches(5.2), BG_MED)
txt(s, Inches(1), Inches(1.75), Inches(5), Inches(0.35), "NIR Spectroscopy Principles", 15, GRN, True)
bullets(s, Inches(1), Inches(2.2), Inches(5.2), Inches(2.5), [
    "Near-infrared light (900-1700nm) interacts with molecular bonds",
    "N-H bonds -> Protein content measurement",
    "C-H bonds -> Fiber and fat content analysis",
    "O-H bonds -> Moisture content determination",
    "128-point resolution across NIR spectrum",
    "Non-destructive, non-contact measurement",
    "Results in <3 seconds per scan"
], 12)
txt(s, Inches(1), Inches(4.5), Inches(5), Inches(0.35), "Calibration Approach", 15, ORG, True)
bullets(s, Inches(1), Inches(5.0), Inches(5.2), Inches(1.5), [
    "Initial calibration against NABL lab data",
    "Continuous learning with farmer feedback",
    "Regional calibration models (North/South/East/West)",
    "Feed-type specific (Cattle/Poultry/Aqua)"
], 12)
rect(s, Inches(6.6), Inches(1.6), Inches(5.9), Inches(5.2), BG_MED)
txt(s, Inches(6.8), Inches(1.75), Inches(5.5), Inches(0.35), "Spectral Analysis Pipeline", 15, BLU, True)
spec_pipe = [("Raw Spectra", "128-point reflectance values"), ("Preprocessing", "SNV + Savitzky-Golay smoothing"), ("Feature Selection", "VIP scores + PCA wavelengths"), ("Model Input", "PLS/RF regression model"), ("Output", "Protein%, Fiber%, Energy, Moisture%"), ("Validation", "R2 > 0.95, RMSEP < 1.5%")]
y = Inches(2.2)
for stg, d in spec_pipe:
    rect(s, Inches(6.8), y, Inches(5.5), Inches(0.65), CARD_BG)
    txt(s, Inches(7), y+Inches(0.05), Inches(2.5), Inches(0.2), stg, 11, BLU, True)
    txt(s, Inches(7), y+Inches(0.3), Inches(5.1), Inches(0.25), d, 10, LGT)
    y += Inches(0.7)
num(s, 20)
sn(s, "NIR spectroscopy analyzes molecular bonds. Pipeline achieves R2 > 0.95 against lab reference. Results in under 3 seconds.")

# ========== SLIDE 21: BIOSENSOR MODULE ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Biosensor Module", "Physical parameter monitoring")
bio_s = [
    ("Capacitive Moisture Sensor", "Measures dielectric constant for moisture. Range 0-100%, accuracy +/-2%. Critical for silage quality and fungal risk.", GRN),
    ("DHT22 Temperature/Humidity", "Ambient temp (-40 to 80C) and humidity (0-100% RH). Essential for storage condition monitoring.", BLU),
    ("MQ-137 Ammonia Sensor", "Detects ammonia gas indicating protein degradation or urea adulteration. Threshold-based alerts.", ORG),
    ("HX711 Load Cell", "Precision weight (0-10kg, 0.1g resolution). Ensures consistent sample sizing for accurate readings.", YLW),
]
for i, (t, d, c) in enumerate(bio_s):
    y = Inches(1.6)+Inches(i*1.35)
    rect(s, Inches(0.8), y, Inches(11.7), Inches(1.15), BG_MED)
    rect(s, Inches(0.8), y, Inches(0.06), Inches(1.15), c)
    txt(s, Inches(1.1), y+Inches(0.1), Inches(4), Inches(0.25), t, 14, c, True)
    txt(s, Inches(1.1), y+Inches(0.4), Inches(11.2), Inches(0.6), d, 12, LGT)
txt(s, Inches(0.8), Inches(6.5), Inches(11.7), Inches(0.4), "All biosensor readings time-synchronized and combined with NIR and CV data for multi-modal analysis.", 13, GRY, al=PP_ALIGN.CENTER)
num(s, 21)
sn(s, "Four biosensor types providing physical parameters complementary to NIR chemical analysis.")

# ========== SLIDE 22: AI MODELS ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "AI Models - Detailed", "Model specifications and performance")
ai_models = [
    ("PLS Regression", "Nutrition", "Partial Least Squares for spectral->nutrient. Handles multicollinearity.", "R2=0.96", GRN),
    ("Random Forest", "Nutrition", "500 trees ensemble. Feature importance for wavelength selection.", "R2=0.94", GRN),
    ("YOLOv8-Nano", "Contamination", "Real-time object detection. 2.1M params. 50ms inference.", "mAP=0.89", BLU),
    ("MobileNetV3", "Classification", "Lightweight CNN. 12 classes. Transfer learning.", "Acc=93%", BLU),
    ("XGBoost", "Adulteration", "Gradient boosting. 50 features. 5 adulteration classes.", "F1=0.91", ORG),
    ("Isolation Forest", "Anomaly", "Unsupervised anomaly detection for unknown contaminants.", "AUC=0.97", YLW),
]
for i, (nm, task, d, m, c) in enumerate(ai_models):
    r, co = i//3, i%3
    x, y = Inches(0.8+co*4.1), Inches(1.6+r*2.8)
    rect(s, x, y, Inches(3.8), Inches(2.5), BG_MED)
    rect(s, x+Inches(2.7), y+Inches(0.15), Inches(0.9), Inches(0.4), c)
    txt(s, x+Inches(2.75), y+Inches(0.17), Inches(0.85), Inches(0.35), m, 11, BG_DARK, True, PP_ALIGN.CENTER)
    txt(s, x+Inches(0.2), y+Inches(0.15), Inches(2.4), Inches(0.3), nm, 15, c, True)
    txt(s, x+Inches(0.2), y+Inches(0.55), Inches(1.2), Inches(0.25), task, 10, GRY)
    txt(s, x+Inches(0.2), y+Inches(0.9), Inches(3.4), Inches(1.4), d, 11, LGT)
num(s, 22)
sn(s, "Six AI models. PLS/RF for nutrition, YOLOv8/MobileNet for contamination, XGBoost for adulteration, Isolation Forest for anomaly. All >89% metrics.")

# ========== SLIDE 23: ML PIPELINE ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Machine Learning Pipeline", "End-to-end ML lifecycle")
ml_stages = [
    ("Data Collection", "10,000+ NIR samples. Labeled images. Paired biosensor data.", GRN),
    ("Preprocessing", "SNV, MSC, SG smoothing. Image augment. Sensor calibration.", BLU),
    ("Feature Engineering", "PCA, wavelets, derivatives. HOG, LBP, color histograms.", ORG),
    ("Model Training", "AWS SageMaker. Optuna tuning. 5-fold cross-validation.", YLW),
    ("Optimization", "INT8 quantization. 30% pruning. Distillation. <50MB models.", LGT),
    ("Deployment", "TFLite conversion. ONNX export. OTA updates. A/B testing.", RED),
]
for i, (t, d, c) in enumerate(ml_stages):
    r, co = i//3, i%3
    x, y = Inches(0.8+co*4.1), Inches(1.6+r*2.8)
    rect(s, x, y, Inches(3.8), Inches(2.4), BG_MED)
    rect(s, x+Inches(0.15), y+Inches(0.15), Inches(0.4), Inches(0.4), c)
    txt(s, x+Inches(0.18), y+Inches(0.17), Inches(0.35), Inches(0.35), str(i+1), 16, BG_DARK, True, PP_ALIGN.CENTER)
    txt(s, x+Inches(0.65), y+Inches(0.18), Inches(2.9), Inches(0.3), t, 15, c, True)
    txt(s, x+Inches(0.2), y+Inches(0.7), Inches(3.4), Inches(1.5), d, 12, LGT)
num(s, 23)
sn(s, "Six-stage ML pipeline. 10,000+ samples, preprocessing, feature engineering, cloud training, optimization with quantization, edge deployment.")

# ========== SLIDE 24: CLOUD ARCHITECTURE ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Cloud Architecture", "AWS-based scalable infrastructure")
cloud = [
    ("AWS IoT Core", "MQTT broker. Device shadow. Rules engine for data routing.", GRN),
    ("AWS Lambda", "Serverless functions. Event-driven. Auto-scaling.", BLU),
    ("Amazon S3", "Object storage for spectra, images, models. Versioning.", ORG),
    ("Amazon RDS", "PostgreSQL for users, devices, analyses, advisories.", YLW),
    ("Amazon SageMaker", "Cloud ML training. Model registry. A/B testing.", LGT),
    ("API Gateway", "RESTful API. WebSocket real-time. Rate limiting.", RED),
]
for i, (t, d, c) in enumerate(cloud):
    r, co = i//3, i%3
    x, y = Inches(0.8+co*4.1), Inches(1.6+r*2.8)
    rect(s, x, y, Inches(3.8), Inches(2.4), BG_MED)
    rect(s, x, y, Inches(3.8), Inches(0.06), c)
    txt(s, x+Inches(0.2), y+Inches(0.2), Inches(3.4), Inches(0.3), t, 15, c, True)
    txt(s, x+Inches(0.2), y+Inches(0.7), Inches(3.4), Inches(1.5), d, 12, LGT)
num(s, 24)
sn(s, "AWS cloud architecture with IoT Core, Lambda, S3, RDS, SageMaker, and API Gateway.")

# ========== SLIDE 25: IOT ARCHITECTURE ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "IoT Architecture", "Edge-to-cloud connectivity")
iot = [
    ("Device Layer", "FeedIQ Device -> Sensors -> Local Processing -> MQTT Client", GRN, Inches(1.7)),
    ("Edge Layer", "Local ML Inference -> Data Buffering -> Offline Mode -> OTA Updates", BLU, Inches(2.8)),
    ("Network Layer", "WiFi (Primary) -> 4G LTE (Backup) -> MQTT over TLS 1.3", ORG, Inches(3.9)),
    ("Cloud Layer", "AWS IoT Core -> Rules Engine -> Lambda -> S3/RDS -> Analytics", YLW, Inches(5.0)),
    ("Application Layer", "Mobile App (React Native) -> Web Dashboard -> Admin Portal", LGT, Inches(6.1)),
]
for t, d, c, y in iot:
    rect(s, Inches(1.0), y, Inches(11.3), Inches(0.85), CARD_BG)
    rect(s, Inches(1.0), y, Inches(0.06), Inches(0.85), c)
    txt(s, Inches(1.3), y+Inches(0.08), Inches(2.5), Inches(0.3), t, 14, c, True)
    txt(s, Inches(1.3), y+Inches(0.4), Inches(10.8), Inches(0.3), d, 12, LGT)
num(s, 25)
sn(s, "Five-layer IoT architecture. MQTT with TLS 1.3. Offline mode for rural areas. OTA updates for maintenance.")

# ========== SLIDE 26: DATABASE DESIGN ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Database Design", "Data models and storage strategy")
rect(s, Inches(0.8), Inches(1.6), Inches(5.5), Inches(5.2), BG_MED)
txt(s, Inches(1), Inches(1.75), Inches(5), Inches(0.35), "PostgreSQL (Structured)", 15, GRN, True)
pg = ["users (id, name, phone, role, language, location)", "devices (id, user_id, model, firmware, status)", "analyses (id, device_id, timestamp, results)", "advisories (id, analysis_id, recommendations)", "manufacturers (id, name, brand, compliance)", "subscriptions (id, user_id, plan, expiry)"]
bullets(s, Inches(1), Inches(2.2), Inches(5.2), Inches(2.0), pg, 11)
txt(s, Inches(1), Inches(4.3), Inches(5), Inches(0.35), "MongoDB (Spectral Data)", 15, BLU, True)
bullets(s, Inches(1), Inches(4.7), Inches(5.2), Inches(1.2), ["nir_spectra: 128-point arrays", "image_data: Base64 + S3 refs", "raw_sensor: Time-series data"], 11)
rect(s, Inches(6.6), Inches(1.6), Inches(5.9), Inches(5.2), BG_MED)
txt(s, Inches(6.8), Inches(1.75), Inches(5.5), Inches(0.35), "Redis (Cache)", 15, ORG, True)
bullets(s, Inches(6.8), Inches(2.2), Inches(5.5), Inches(1.2), ["Device status (TTL 60s)", "Session management", "Real-time pub/sub", "Rate limiting counters"], 12)
txt(s, Inches(6.8), Inches(3.5), Inches(5.5), Inches(0.35), "S3 (Object Storage)", 15, YLW, True)
bullets(s, Inches(6.8), Inches(3.9), Inches(5.5), Inches(1.2), ["Raw spectral data files", "Feed images", "ML model artifacts", "Backup and archival"], 12)
txt(s, Inches(6.8), Inches(5.2), Inches(5.5), Inches(0.35), "Data Retention", 15, RED, True)
bullets(s, Inches(6.8), Inches(5.6), Inches(5.5), Inches(0.8), ["Raw: 2 years | Aggregated: 5 years | Models: Permanent"], 12)
num(s, 26)
sn(s, "Four database systems. PostgreSQL for structured data, MongoDB for spectral arrays, Redis for caching, S3 for object storage.")

# ========== SLIDE 27: APIs ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "API Design", "RESTful API endpoints")
rect(s, Inches(0.8), Inches(1.6), Inches(5.5), Inches(5.2), BG_MED)
txt(s, Inches(1), Inches(1.75), Inches(5), Inches(0.35), "Core Endpoints", 15, GRN, True)
apis = [("POST", "/api/v1/analyze", "Submit data for analysis"), ("GET", "/api/v1/analysis/{id}", "Get analysis results"), ("GET", "/api/v1/history", "User analysis history"), ("POST", "/api/v1/device/register", "Register new device"), ("GET", "/api/v1/advisory/{id}", "Get farmer advisory"), ("PUT", "/api/v1/device/{id}/firmware", "OTA firmware update")]
y = Inches(2.2)
for m, ep, d in apis:
    mc = GRN if m=="POST" else BLU if m=="GET" else ORG
    rect(s, Inches(1), y, Inches(5.1), Inches(0.5), CARD_BG)
    rect(s, Inches(1.1), y+Inches(0.08), Inches(0.6), Inches(0.3), mc)
    txt(s, Inches(1.12), y+Inches(0.09), Inches(0.58), Inches(0.28), m, 9, BG_DARK, True, PP_ALIGN.CENTER)
    txt(s, Inches(1.8), y+Inches(0.05), Inches(2.5), Inches(0.2), ep, 11, GRN)
    txt(s, Inches(1.8), y+Inches(0.25), Inches(4), Inches(0.2), d, 10, LGT)
    y += Inches(0.55)
rect(s, Inches(6.6), Inches(1.6), Inches(5.9), Inches(5.2), BG_MED)
txt(s, Inches(6.8), Inches(1.75), Inches(5.5), Inches(0.35), "API Features", 15, BLU, True)
af = ["JWT authentication with refresh tokens", "Rate limiting: 100 req/min per device", "API versioning (v1, v2)", "OpenAPI 3.0 documentation", "Webhook support for integrations", "GraphQL endpoint for flexible queries", "gRPC for high-throughput device comms", "Request/response logging"]
bullets(s, Inches(6.8), Inches(2.2), Inches(5.5), Inches(4.5), af, 12)
num(s, 27)
sn(s, "RESTful API with 6 core endpoints. JWT auth, rate limiting, versioning. GraphQL and gRPC also supported.")

# ========== SLIDE 28: DATA FLOW ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Data Flow Diagram", "Complete data journey")
rect(s, Inches(0.5), Inches(1.5), Inches(12.3), Inches(5.0), BG_MED)
entities = [("Farmer", Inches(0.8), GRN), ("Device", Inches(3.0), BLU), ("Edge AI", Inches(5.2), ORG), ("AWS IoT", Inches(7.4), YLW), ("Cloud", Inches(9.6), LGT), ("App", Inches(11.8), GRN)]
for nm, x, c in entities:
    rect(s, x, Inches(3.0), Inches(1.8), Inches(0.7), c)
    txt(s, x, Inches(3.1), Inches(1.8), Inches(0.5), nm, 13, BG_DARK, True, PP_ALIGN.CENTER)
labels = [("Insert", Inches(1.9), GRN), ("Sensors", Inches(4.1), BLU), ("MQTT", Inches(6.3), ORG), ("Process", Inches(8.5), YLW), ("API", Inches(10.7), LGT)]
for lb, x, c in labels:
    txt(s, x, Inches(2.5), Inches(1.8), Inches(0.4), lb, 10, c, al=PP_ALIGN.CENTER)
txt(s, Inches(0.8), Inches(4.3), Inches(11.7), Inches(0.4), "Feedback Loop: App -> Cloud -> Device -> Farmer Advisory", 14, GRN, True, PP_ALIGN.CENTER)
txt(s, Inches(0.8), Inches(5.0), Inches(11.7), Inches(0.4), "Formats: JSON (API) | MQTT (IoT) | Protobuf (gRPC) | Base64 (Images)", 12, GRY, al=PP_ALIGN.CENTER)
txt(s, Inches(0.8), Inches(5.5), Inches(11.7), Inches(0.6), "End-to-End Latency: <60 seconds from sample insertion to advisory delivery on mobile app. Offline mode caches data and syncs when connected.", 12, LGT, al=PP_ALIGN.CENTER)
num(s, 28)
sn(s, "Complete data flow from farmer to mobile app. Six entities with defined protocols. Under 60 seconds end-to-end.")

# ========== SLIDE 29: UML CLASS ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "UML Class Diagram", "System class structure")
rect(s, Inches(0.5), Inches(1.5), Inches(12.3), Inches(5.5), BG_MED)
uml = [
    ("SensorHub", ["-status: str", "-nir: NIRSpec", "-camera: Camera"], ["+get_nir(): list", "+bio_data(): dict", "+capture(): array"], GRN, Inches(0.7)),
    ("MLInferenceEngine", ["-models_loaded: bool", "-nutrition: PLS", "-contamination: YOLO"], ["+predict(data): dict", "+detect(img): dict"], BLU, Inches(3.9)),
    ("AdvisoryEngine", ["+generate_report(", "  nutrition, contam,", "  biosensors): list"], ["-check_contamination()", "-check_moisture()", "-balance_nutrition()"], ORG, Inches(7.1)),
    ("FeedAnalyzer", ["-sensors: SensorHub", "-ai: MLInference", "-advisory: Advisory"], ["+run(): payload", "+history(): list"], YLW, Inches(10.3)),
]
for nm, attrs, meths, c, x in uml:
    rect(s, x, Inches(1.8), Inches(2.8), Inches(5.0), CARD_BG)
    rect(s, x, Inches(1.8), Inches(2.8), Inches(0.45), c)
    txt(s, x+Inches(0.1), Inches(1.83), Inches(2.6), Inches(0.4), nm, 13, BG_DARK, True, PP_ALIGN.CENTER)
    txt(s, x+Inches(0.1), Inches(2.4), Inches(2.6), Inches(0.25), "Attributes", 9, c, True)
    txt(s, x+Inches(0.1), Inches(2.65), Inches(2.6), Inches(1.3), "\n".join(attrs), 9, LGT)
    line(s, x+Inches(0.1), Inches(4.1), Inches(2.6), c)
    txt(s, x+Inches(0.1), Inches(4.2), Inches(2.6), Inches(0.25), "Methods", 9, c, True)
    txt(s, x+Inches(0.1), Inches(4.45), Inches(2.6), Inches(1.5), "\n".join(meths), 9, LGT)
num(s, 29)
sn(s, "Four main classes. SensorHub for hardware, MLInferenceEngine for AI, AdvisoryEngine for recommendations, FeedAnalyzer orchestrates pipeline.")

# ========== SLIDE 30: USE CASE ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Use Case Diagram", "System actors and use cases")
rect(s, Inches(0.5), Inches(1.5), Inches(12.3), Inches(5.5), BG_MED)
act = [("Farmer", Inches(0.8), Inches(2.5), GRN), ("Admin", Inches(0.8), Inches(5.0), BLU)]
for nm, x, y, c in act:
    rect(s, x, y, Inches(1.0), Inches(1.2), c)
    txt(s, x, y+Inches(0.4), Inches(1.0), Inches(0.4), nm, 11, BG_DARK, True, PP_ALIGN.CENTER)
uc = [
    ("Analyze Feed", Inches(3), Inches(1.8), GRN), ("View History", Inches(3), Inches(2.7), GRN),
    ("Receive Advisory", Inches(3), Inches(3.6), GRN), ("Compare Prices", Inches(3), Inches(4.5), GRN),
    ("Monitor Devices", Inches(5.5), Inches(1.8), BLU), ("View Analytics", Inches(5.5), Inches(2.7), BLU),
    ("Manage Users", Inches(5.5), Inches(3.6), BLU), ("Generate Reports", Inches(5.5), Inches(4.5), BLU),
    ("Process Sensors", Inches(8), Inches(1.8), ORG), ("Run ML Models", Inches(8), Inches(2.7), ORG),
    ("Store Data", Inches(8), Inches(3.6), ORG), ("Send Alerts", Inches(8), Inches(4.5), ORG),
]
for nm, x, y, c in uc:
    rect(s, x, y, Inches(2.0), Inches(0.6), CARD_BG)
    txt(s, x, y+Inches(0.12), Inches(2.0), Inches(0.35), nm, 10, c, True, PP_ALIGN.CENTER)
num(s, 30)
sn(s, "Three actors with 4 use cases each. Total 12 use cases in the system.")

# ========== SLIDE 31: SEQUENCE DIAGRAM ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Sequence Diagram", "Analysis request flow")
rect(s, Inches(0.5), Inches(1.5), Inches(12.3), Inches(5.5), BG_MED)
seq_act = [("Farmer", Inches(1.5), GRN), ("Mobile App", Inches(3.5), BLU), ("Device", Inches(5.5), ORG), ("Edge AI", Inches(7.5), YLW), ("Cloud", Inches(9.5), LGT), ("DB", Inches(11.5), RED)]
for nm, x, c in seq_act:
    rect(s, x, Inches(1.7), Inches(1.4), Inches(0.35), c)
    txt(s, x, Inches(1.72), Inches(1.4), Inches(0.3), nm, 9, BG_DARK, True, PP_ALIGN.CENTER)
    rect(s, x+Inches(0.65), Inches(2.1), Inches(0.04), Inches(4.3), c)
msgs = [
    ("1. Tap Analyze", Inches(2.4), GRN), ("2. Connect BLE", Inches(2.8), BLU),
    ("3. Start Scan", Inches(3.2), ORG), ("4. Read Sensors", Inches(3.6), ORG),
    ("5. ML Inference", Inches(4.0), YLW), ("6. Publish MQTT", Inches(4.4), YLW),
    ("7. Store Results", Inches(4.8), LGT), ("8. Return Report", Inches(5.2), BLU),
    ("9. Show Advisory", Inches(5.6), GRN),
]
for msg, y, c in msgs:
    txt(s, Inches(1.5), y, Inches(10.5), Inches(0.3), msg, 10, c)
num(s, 31)
sn(s, "Nine-step sequence from tap to advisory. Under 60 seconds total. Each step has timeout and error handling.")

# ========== SLIDE 32: ACTIVITY DIAGRAM ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Activity Diagram", "Analysis process flow")
rect(s, Inches(0.5), Inches(1.5), Inches(12.3), Inches(5.5), BG_MED)
acts = [
    ("Start", Inches(0.8), Inches(1.8), GRN), ("Insert Sample", Inches(0.8), Inches(2.6), BLU),
    ("Read Sensors", Inches(0.8), Inches(3.4), ORG), ("Preprocess", Inches(0.8), Inches(4.2), YLW),
    ("Run ML", Inches(0.8), Inches(5.0), LGT), ("Report", Inches(4), Inches(1.8), GRN),
    ("Advisory", Inches(4), Inches(2.6), BLU), ("Cloud Store", Inches(4), Inches(3.4), ORG),
    ("Display", Inches(4), Inches(4.2), YLW), ("End", Inches(4), Inches(5.0), RED),
]
for nm, x, y, c in acts:
    rect(s, x, y, Inches(1.5), Inches(0.55), c if nm in ("Start","End") else CARD_BG)
    if nm not in ("Start","End"):
        rect(s, x, y, Inches(0.06), Inches(0.55), c)
    txt(s, x, y+Inches(0.1), Inches(1.5), Inches(0.35), nm, 11, BG_DARK if nm in ("Start","End") else c, True, PP_ALIGN.CENTER)
txt(s, Inches(7), Inches(1.8), Inches(5.5), Inches(0.35), "Decision Points", 15, GRN, True)
dec = ["Score > 80? -> Green Advisory", "Score 60-80? -> Amber Advisory", "Score < 60? -> Red Alert", "Contamination? -> Critical Alert", "Moisture > 30%? -> Storage Warning", "Low Protein? -> Supplement Rec", "High Fiber? -> Digestibility Note", "Unknown Anomaly? -> Flag for Lab"]
bullets(s, Inches(7), Inches(2.3), Inches(5.5), Inches(4.0), dec, 12)
num(s, 32)
sn(s, "Ten activities with eight decision points determining advisory type based on analysis results.")

# ========== SLIDE 33: TECHNOLOGY STACK ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Technology Stack", "Complete technology choices")
techs = [
    ("Hardware", ["Raspberry Pi 5 (8GB)", "NIR Spectrometer", "Sony IMX477 Camera", "DHT22 + Sensors", "4G LTE Module", "12V Battery"], GRN),
    ("Edge AI", ["TensorFlow Lite", "ONNX Runtime", "OpenCV", "NumPy/SciPy", "Scikit-learn", "Model Quantization"], BLU),
    ("Cloud", ["AWS IoT Core", "AWS Lambda", "Amazon S3", "Amazon RDS", "SageMaker", "API Gateway"], ORG),
    ("Mobile", ["React Native", "Expo Framework", "AsyncStorage", "React Navigation", "Chart Kit", "i18next"], YLW),
    ("Backend", ["Node.js + Express", "Python FastAPI", "PostgreSQL 15", "MongoDB 7", "Redis 7", "Docker + K8s"], LGT),
    ("DevOps", ["GitHub Actions", "Docker Compose", "Terraform", "Prometheus/Grafana", "Sentry", "Postman"], RED),
]
for i, (cat, items, c) in enumerate(techs):
    r, co = i//3, i%3
    x, y = Inches(0.8+co*4.1), Inches(1.6+r*2.8)
    rect(s, x, y, Inches(3.8), Inches(2.5), BG_MED)
    rect(s, x, y, Inches(3.8), Inches(0.06), c)
    txt(s, x+Inches(0.2), y+Inches(0.15), Inches(3.4), Inches(0.25), cat, 13, c, True)
    for j, item in enumerate(items):
        txt(s, x+Inches(0.3), y+Inches(0.5+j*0.3), Inches(3.2), Inches(0.25), item, 11, LGT)
num(s, 33)
sn(s, "Six technology categories. All production-ready with strong community support.")

# ========== SLIDE 34: INNOVATION ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Innovation & Novelty", "What makes FeedIQ unique")
innov = [
    ("First-of-its-Kind", "India's first portable AI feed tester combining NIR, CV, and biosensors.", GRN),
    ("Multi-Modal Fusion", "Three sensing modalities integrated for comprehensive analysis.", BLU),
    ("Edge AI at Farm Level", "On-device ML inference. Works offline. Results in <60s.", ORG),
    ("Vernacular Intelligence", "7 Indian languages with voice support. Bridges digital divide.", YLW),
    ("Continuous Learning", "Models improve per scan. Federated learning preserves privacy.", LGT),
    ("Open Data Ecosystem", "First comprehensive feed quality database for India.", RED),
]
for i, (t, d, c) in enumerate(innov):
    r, co = i//3, i%3
    x, y = Inches(0.8+co*4.1), Inches(1.6+r*2.8)
    rect(s, x, y, Inches(3.8), Inches(2.4), BG_MED)
    rect(s, x, y, Inches(3.8), Inches(0.06), c)
    txt(s, x+Inches(0.2), y+Inches(0.2), Inches(3.4), Inches(0.3), t, 15, c, True)
    txt(s, x+Inches(0.2), y+Inches(0.7), Inches(3.4), Inches(1.5), d, 12, LGT)
num(s, 34)
sn(s, "Six innovations. First portable AI feed tester, multi-modal fusion, edge AI, vernacular, continuous learning, open data.")

# ========== SLIDE 35: USP ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s, DARK_BG)
txt(s, Inches(1), Inches(0.5), Inches(11.3), Inches(0.6), "Unique Selling Proposition", 32, WHT, True, PP_ALIGN.CENTER)
line(s, Inches(4), Inches(1.2), Inches(5.3))
rect(s, Inches(1.5), Inches(1.8), Inches(10.3), Inches(1.8), BG_MED)
txt(s, Inches(2), Inches(1.9), Inches(9.3), Inches(1.5), "India's first portable, AI-powered feed quality analyzer that provides lab-grade nutritional profiling, contamination detection, and personalized farmer advisory in under 60 seconds - at 1/100th the cost of lab testing.", 20, GRN, True, PP_ALIGN.CENTER)
txt(s, Inches(1), Inches(4.0), Inches(11.3), Inches(0.5), "Key Differentiators", 22, YLW, True, PP_ALIGN.CENTER)
usps = [("60 Seconds", "vs 3-7 Days (Lab)", GRN), ("Rs. 50", "vs Rs. 2,000-5,000", BLU), ("95%+ Accuracy", "Comparable to Lab", ORG), ("7 Languages", "vs English-only", YLW)]
for i, (o, t, c) in enumerate(usps):
    x = Inches(0.8+i*3.1)
    rect(s, x, Inches(4.7), Inches(2.8), Inches(1.8), BG_MED)
    txt(s, x, Inches(4.8), Inches(2.8), Inches(0.5), o, 22, c, True, PP_ALIGN.CENTER)
    txt(s, x, Inches(5.4), Inches(2.8), Inches(0.4), t, 12, GRY, al=PP_ALIGN.CENTER)
txt(s, Inches(1), Inches(6.7), Inches(11.3), Inches(0.5), "One-Line USP: \"Lab-quality feed testing in your pocket, in 60 seconds, in your language.\"", 16, WHT, True, PP_ALIGN.CENTER)
num(s, 35)
sn(s, "Our USP: First portable AI feed tester. 60 seconds, Rs. 50, 95%+ accuracy, 7 languages. Lab-quality in your pocket.")

# ========== SLIDE 36: COMPARISON ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Comparison with Existing Solutions", "Why FeedIQ wins")
rect(s, Inches(0.5), Inches(1.5), Inches(12.3), Inches(5.5), BG_MED)
hdrs = ["Feature", "FeedIQ", "Lab Testing", "Visual Check", "Kits"]
hcols = [GRY, GRN, ORG, RED, BLU]
cws = [Inches(2.5), Inches(2.5), Inches(2.5), Inches(2.5), Inches(2.3)]
cs = [Inches(0.7)]
for w in cws[:-1]: cs.append(cs[-1]+w)
for i, (h, c) in enumerate(zip(hdrs, hcols)):
    rect(s, cs[i], Inches(1.7), cws[i], Inches(0.45), c)
    txt(s, cs[i], Inches(1.72), cws[i], Inches(0.4), h, 11, BG_DARK, True, PP_ALIGN.CENTER)
rows = [
    ["Test Time", "< 60 seconds", "3-7 days", "Instant (unreliable)", "5-10 min"],
    ["Cost/Test", "Rs. 50", "Rs. 2,000-5,000", "Free (unreliable)", "Rs. 200-500"],
    ["Parameters", "Nutrition + Safety", "Comprehensive", "Visual only", "Limited (2-3)"],
    ["Accuracy", "95%+", "99% (gold standard)", "30-40%", "60-70%"],
    ["Portability", "Fully portable", "Lab-bound", "Handheld", "Portable kit"],
    ["Languages", "7 Indian languages", "English reports", "None", "English"],
    ["Data Storage", "Cloud + Local", "Paper reports", "None", "Manual entry"],
    ["Real-time", "Yes + Advisory", "No", "No", "Partial"],
]
for ri, row in enumerate(rows):
    y = Inches(2.2)+Inches(ri*0.55)
    bg2 = CARD_BG if ri%2==0 else BG_MED
    for ci, cell in enumerate(row):
        rect(s, cs[ci], y, cws[ci], Inches(0.5), bg2)
        c2 = GRN if ci==1 else LGT if ci==0 else LGT
        txt(s, cs[ci], y+Inches(0.08), cws[ci], Inches(0.35), cell, 10, c2, ci==0, PP_ALIGN.CENTER)
num(s, 36)
sn(s, "Comparison across 8 features. FeedIQ outperforms on time, cost, portability, languages, and data storage.")

# ========== SLIDE 37: SCALABILITY ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Scalability Plan", "Growth roadmap")
phases_sc = [
    ("Year 1", "Pilot", "50 devices in 3 districts. 500 farmers. Validate technology and business model.", GRN),
    ("Year 2", "Regional", "500 devices across 3 states. 5,000 farmers. Partnership with dairy cooperatives.", BLU),
    ("Year 3", "National", "5,000 devices in 15 states. 50,000 farmers. Government tender participation.", ORG),
    ("Year 4-5", "Scale", "25,000+ devices nationwide. 500,000 farmers. International expansion (Nepal, Bangladesh).", YLW),
]
for i, (yr, ph, d, c) in enumerate(phases_sc):
    x = Inches(0.8+i*3.1)
    rect(s, x, Inches(1.6), Inches(2.8), Inches(5.2), BG_MED)
    rect(s, x, Inches(1.6), Inches(2.8), Inches(0.06), c)
    txt(s, x+Inches(0.15), Inches(1.8), Inches(2.5), Inches(0.25), yr, 12, c, True)
    txt(s, x+Inches(0.15), Inches(2.1), Inches(2.5), Inches(0.35), ph, 20, WHT, True)
    line(s, x+Inches(0.15), Inches(2.55), Inches(2.5), c)
    txt(s, x+Inches(0.15), Inches(2.75), Inches(2.5), Inches(3.5), d, 13, LGT)
num(s, 37)
sn(s, "Four-phase scalability plan from 50 pilot devices to 25,000+ nationwide over 5 years. International expansion in year 4-5.")

# ========== SLIDE 38: SECURITY ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Security & Privacy", "Data protection measures")
sec = [
    ("Device Security", "Encrypted storage (LUKS). Secure boot. Signed firmware. TPM module. Physical tamper detection.", GRN),
    ("Communication", "TLS 1.3 for all MQTT/API traffic. Certificate-based device auth. VPN for admin access.", BLU),
    ("Data Privacy", "GDPR-compliant. Data anonymization. User consent framework. Right to deletion. No PII in spectral data.", ORG),
    ("Cloud Security", "AWS VPC. IAM roles. Encryption at rest (AES-256). WAF. DDoS protection. Audit logging.", YLW),
    ("Access Control", "RBAC for all users. JWT tokens with expiry. API key rotation. Rate limiting per device.", LGT),
    ("Compliance", "IT Act 2000. DPDP Act 2023. FSSAI guidelines. ISO 27001 target. Regular penetration testing.", RED),
]
for i, (t, d, c) in enumerate(sec):
    r, co = i//3, i%3
    x, y = Inches(0.8+co*4.1), Inches(1.6+r*2.8)
    rect(s, x, y, Inches(3.8), Inches(2.4), BG_MED)
    rect(s, x, y, Inches(3.8), Inches(0.06), c)
    txt(s, x+Inches(0.2), y+Inches(0.2), Inches(3.4), Inches(0.3), t, 14, c, True)
    txt(s, x+Inches(0.2), y+Inches(0.65), Inches(3.4), Inches(1.5), d, 11, LGT)
num(s, 38)
sn(s, "Six security layers. Device encryption, TLS 1.3 communication, GDPR-compliant data privacy, AWS cloud security, RBAC, and regulatory compliance.")

# ========== SLIDE 39: COST & BUSINESS ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Cost Estimation & Business Model", "Financial sustainability")
rect(s, Inches(0.8), Inches(1.6), Inches(5.5), Inches(5.2), BG_MED)
txt(s, Inches(1), Inches(1.75), Inches(5), Inches(0.35), "Cost Breakdown", 15, GRN, True)
costs = [("BOM Cost (per unit)", "Rs. 36,000"), ("Assembly & Testing", "Rs. 5,000"), ("Cloud (per device/year)", "Rs. 3,600"), ("Development (one-time)", "Rs. 25,00,000"), ("Marketing & Distribution", "Rs. 10,00,000"), ("Target Selling Price", "Rs. 55,000"), ("Gross Margin", "25-30%"), ("Payback Period", "14 months")]
y = Inches(2.2)
for it, ct in costs:
    c2 = YLW if "Target" in it or "Margin" in it or "Payback" in it else LGT
    txt(s, Inches(1), y, Inches(3), Inches(0.25), it, 11, c2, "Target" in it)
    txt(s, Inches(4.2), y, Inches(1.8), Inches(0.25), ct, 11, c2, "Target" in it, PP_ALIGN.RIGHT)
    y += Inches(0.3)
rect(s, Inches(6.6), Inches(1.6), Inches(5.9), Inches(5.2), BG_MED)
txt(s, Inches(6.8), Inches(1.75), Inches(5.5), Inches(0.35), "Revenue Streams", 15, BLU, True)
rev = [
    ("Device Sales", "One-time hardware sale (Rs. 55,000)"),
    ("Subscription SaaS", "Rs. 499/month for cloud analytics + advisory"),
    ("API Licensing", "Data access for research institutions"),
    ("White-labeling", "Custom branding for dairy cooperatives"),
    ("Government Tenders", "Bulk procurement for state programs"),
]
y = Inches(2.2)
for nm, d in rev:
    rect(s, Inches(6.8), y, Inches(5.5), Inches(0.6), CARD_BG)
    txt(s, Inches(7), y+Inches(0.05), Inches(5.1), Inches(0.2), nm, 11, BLU, True)
    txt(s, Inches(7), y+Inches(0.3), Inches(5.1), Inches(0.25), d, 10, LGT)
    y += Inches(0.65)
num(s, 39)
sn(s, "BOM Rs. 36,000, selling price Rs. 55,000. Five revenue streams including device sales, SaaS subscription, API licensing, white-labeling, and government tenders.")

# ========== SLIDE 40: IMPACT & SDGs ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Impact Analysis & SDGs", "Multi-dimensional impact")
rect(s, Inches(0.8), Inches(1.6), Inches(3.7), Inches(5.2), BG_MED)
txt(s, Inches(1), Inches(1.75), Inches(3.3), Inches(0.35), "Government Impact", 15, GRN, True)
bullets(s, Inches(1), Inches(2.2), Inches(3.3), Inches(2.0), [
    "Data for policy formulation",
    "Feed quality standards enforcement",
    "Subsidy targeting optimization",
    "Export quality assurance"
], 12)
txt(s, Inches(1), Inches(4.3), Inches(3.3), Inches(0.35), "Social Impact", 15, BLU, True)
bullets(s, Inches(1), Inches(4.7), Inches(3.3), Inches(2.0), [
    "Farmer income increase 15-20%",
    "Livestock health improvement",
    "Women empowerment (dairy)",
    "Rural employment generation"
], 12)
rect(s, Inches(4.8), Inches(1.6), Inches(3.7), Inches(5.2), BG_MED)
txt(s, Inches(5), Inches(1.75), Inches(3.3), Inches(0.35), "Economic Impact", 15, ORG, True)
bullets(s, Inches(5), Inches(2.2), Inches(3.3), Inches(2.0), [
    "Rs. 50,000 Cr loss reduction",
    "15-25% milk yield increase",
    "Feed industry modernization",
    "New market creation"
], 12)
txt(s, Inches(5), Inches(4.3), Inches(3.3), Inches(0.35), "Environmental Impact", 15, YLW, True)
bullets(s, Inches(5), Inches(4.7), Inches(3.3), Inches(2.0), [
    "Reduced feed waste",
    "Optimized resource use",
    "Lower carbon footprint",
    "Sustainable dairy practices"
], 12)
rect(s, Inches(8.8), Inches(1.6), Inches(3.7), Inches(5.2), BG_MED)
txt(s, Inches(9), Inches(1.75), Inches(3.3), Inches(0.35), "UN SDGs Supported", 15, LGT, True)
sdgs = [
    ("SDG 2", "Zero Hunger - Quality feed for food security"),
    ("SDG 3", "Good Health - Reduced toxin exposure"),
    ("SDG 8", "Decent Work - Rural employment"),
    ("SDG 9", "Industry - Innovation in agriculture"),
    ("SDG 12", "Responsible Consumption - Reduced waste"),
    ("SDG 17", "Partnerships - Multi-stakeholder collab"),
]
y = Inches(2.2)
for sdg, d in sdgs:
    rect(s, Inches(8.8), y, Inches(3.5), Inches(0.7), CARD_BG)
    txt(s, Inches(9), y+Inches(0.05), Inches(3.1), Inches(0.25), sdg, 12, GRN, True)
    txt(s, Inches(9), y+Inches(0.3), Inches(3.1), Inches(0.3), d, 10, LGT)
    y += Inches(0.75)
num(s, 40)
sn(s, "Four impact dimensions. 6 UN SDGs supported. Rs. 50,000 Cr loss reduction potential. 15-25% milk yield increase.")

# ========== SLIDE 41: TIMELINE & RISKS ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Implementation Timeline & Risk Mitigation", "Planning and risk management")
rect(s, Inches(0.8), Inches(1.6), Inches(5.5), Inches(5.2), BG_MED)
txt(s, Inches(1), Inches(1.75), Inches(5), Inches(0.35), "12-Month Timeline", 15, GRN, True)
tl = [
    ("Month 1-2", "Research, sensor selection, model architecture", GRN),
    ("Month 3-4", "Hardware prototype, sensor integration", BLU),
    ("Month 5-6", "ML model training, edge deployment", ORG),
    ("Month 7-8", "Mobile app, cloud backend, API development", YLW),
    ("Month 9-10", "Lab validation, field trials (50 farmers)", LGT),
    ("Month 11-12", "Pilot deployment, feedback, scaling plan", RED),
]
y = Inches(2.2)
for ph, d, c in tl:
    rect(s, Inches(1), y, Inches(5.1), Inches(0.55), CARD_BG)
    rect(s, Inches(1), y, Inches(0.06), Inches(0.55), c)
    txt(s, Inches(1.2), y+Inches(0.05), Inches(1.5), Inches(0.2), ph, 11, c, True)
    txt(s, Inches(1.2), y+Inches(0.25), Inches(4.7), Inches(0.2), d, 10, LGT)
    y += Inches(0.6)
rect(s, Inches(6.6), Inches(1.6), Inches(5.9), Inches(5.2), BG_MED)
txt(s, Inches(6.8), Inches(1.75), Inches(5.5), Inches(0.35), "Risk Mitigation", 15, RED, True)
risks = [
    ("Sensor accuracy drift", "Regular calibration against lab standards", "High"),
    ("Farmer adoption resistance", "Demonstrations, local champions, incentives", "Medium"),
    ("Connectivity issues in rural", "Offline mode, 4G fallback, data caching", "High"),
    ("Model performance decay", "Continuous monitoring, retraining pipeline", "Medium"),
    ("Regulatory changes", "Flexible architecture, compliance team", "Low"),
    ("Competitive entry", "First-mover advantage, patent filing, data moat", "Medium"),
]
y = Inches(2.2)
for risk, mitigation, sev in risks:
    rect(s, Inches(6.8), y, Inches(5.5), Inches(0.7), CARD_BG)
    c = RED if sev=="High" else ORG if sev=="Medium" else GRN
    txt(s, Inches(7), y+Inches(0.05), Inches(3.5), Inches(0.2), risk, 11, c, True)
    txt(s, Inches(7), y+Inches(0.3), Inches(5.1), Inches(0.2), mitigation, 10, LGT)
    txt(s, Inches(11.5), y+Inches(0.05), Inches(0.8), Inches(0.2), sev, 9, c, True, PP_ALIGN.RIGHT)
    y += Inches(0.76)
num(s, 41)
sn(s, "12-month timeline with 6 risk mitigation strategies. High priority: sensor accuracy and connectivity. Medium: adoption and model decay.")

# ========== SLIDE 42: FUTURE SCOPE & DEMO ==========
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
header(s, "Future Scope & Demo Scenario", "What's next and how it works")
rect(s, Inches(0.8), Inches(1.6), Inches(5.5), Inches(5.2), BG_MED)
txt(s, Inches(1), Inches(1.75), Inches(5), Inches(0.35), "Future Scope", 15, GRN, True)
future = [
    "Multi-feed support (Fish/Poultry/Cattle/Goat)",
    "Blockchain-based supply chain traceability",
    "Satellite imagery for crop quality correlation",
    "Integration with government subsidy platforms",
    "API marketplace for third-party developers",
    "Drone-based sample collection system",
    "Predictive analytics for seasonal quality patterns",
    "International expansion (South Asia, Africa)",
]
bullets(s, Inches(1), Inches(2.2), Inches(5.2), Inches(4.5), future, 12)
rect(s, Inches(6.6), Inches(1.6), Inches(5.9), Inches(5.2), BG_MED)
txt(s, Inches(6.8), Inches(1.75), Inches(5.5), Inches(0.35), "Demo Scenario", 15, BLU, True)
demo = [
    "Step 1: Farmer opens FeedIQ app on phone",
    "Step 2: Inserts feed sample into device tray",
    "Step 3: Tap 'Analyze' - device activates sensors",
    "Step 4: NIR scans in 3 seconds, camera captures image",
    "Step 5: Edge AI processes all sensor data locally",
    "Step 6: Results displayed: Protein 16.2%, Fiber 21.1%",
    "Step 7: Safety: Green (Safe). Quality Score: 87/100",
    "Step 8: Advisory: 'Excellent quality. Optimal for dairy.'",
    "Step 9: Data synced to cloud. History updated.",
    "Step 10: Farmer shares report with cooperative.",
]
for i, step in enumerate(demo):
    txt(s, Inches(6.8), Inches(2.2)+Inches(i*0.42), Inches(5.5), Inches(0.35), step, 11, LGT)
num(s, 42)
sn(s, "Future scope includes 8 expansion areas. Demo shows 10-step farmer journey from sample insertion to sharing results with cooperative.")

# ========== SAVE ==========
output_path = r"C:\Users\MD Atif\OneDrive\Documents\Default Project\FeedIQ_SIH_Presentation.pptx"
prs.save(output_path)
print(f"Presentation saved to: {output_path}")
print(f"Total slides: {len(prs.slides)}")
