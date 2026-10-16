Add-Type -AssemblyName System.Speech

$text = @'
Every day, dairy farmers make feed decisions with scattered readings, paper notes, and very little traceability.

NutriScan AI turns that process into one clear field workflow: sample, scan, analyze, and act.

A farmer creates a batch, chooses feed or silage, and records measured values from a report, instrument, or reviewed sensor input. The guided form keeps the sample identity, units, and ten required readings together, so missing data is visible rather than guessed.

NutriScan then produces an explainable prototype score, risk signal, anomalies, and the next practical action. This example is a low-risk result at ninety-three point nine out of one hundred.

The important part is the context: it is explicitly uncalibrated, not a laboratory test, and never a feed-safety certificate.

Every saved screening becomes traceable farm history. Operators can compare batches, download a report, use multilingual measurement help, keep offline drafts, attach private evidence photos, and connect reviewed ESP32 readings when available.

NutriScan AI does not pretend to replace a laboratory. It makes field evidence more consistent, explainable, and actionable, while keeping the path to calibration and expert validation clear.
'@

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = -1
$synth.Volume = 100
$path = Join-Path $PSScriptRoot '..\assets\voiceover.wav'
$synth.SetOutputToWaveFile($path)
$synth.Speak($text)
$synth.Dispose()
Write-Output $path
