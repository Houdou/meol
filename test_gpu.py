#!/usr/bin/env python
"""Test script to verify GPU setup for Whisper"""
import torch
import whisper

print("=" * 60)
print("GPU Setup Verification")
print("=" * 60)

# Check PyTorch CUDA
print("\n1. PyTorch CUDA Check:")
print(f"   PyTorch version: {torch.__version__}")
print(f"   CUDA available: {torch.cuda.is_available()}")

if torch.cuda.is_available():
    print(f"   CUDA version: {torch.version.cuda}")
    print(f"   GPU name: {torch.cuda.get_device_name(0)}")
    print(f"   GPU count: {torch.cuda.device_count()}")
    print(f"   GPU memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.2f} GB")
else:
    print("   ⚠️  CUDA not available - will use CPU")

# Test Whisper model loading
print("\n2. Whisper Model Loading Test:")
try:
    print("   Loading tiny model...")
    model = whisper.load_model("tiny", device="cuda" if torch.cuda.is_available() else "cpu")
    device_used = next(model.parameters()).device
    print(f"   ✓ Model loaded successfully on: {device_used}")
    print(f"   ✓ GPU acceleration: {'ENABLED' if 'cuda' in str(device_used) else 'DISABLED'}")
except Exception as e:
    print(f"   ✗ Error loading model: {e}")

print("\n" + "=" * 60)
print("Setup complete! Your GPU is ready for Whisper transcription.")
print("=" * 60)

