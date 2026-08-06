---
description: Workflow for Signal Processing, Spectrograms, Compression, and HSI
---

# Signal Processing & HSI Workflow

Use this workflow for spectral analysis, audio unmixing, compression algorithms, and hyperspectral imaging projects.

## 1. Core Libraries
- **SciPy / NumPy**: For FFT and matrix operations.
- **PyTorch (MPS)**: For tensor-based massive parallel processing (e.g., "Tensor of diffs/residuals").
- **Matplotlib / Seaborn**: For high-density plotting (Spectrograms, Spectral Density).

## 2. Directory Structure
```
project_root/
  ├── algorithms/         # Core math implementations (FFT, Wavelets, Quantization)
  ├── notebooks/          # Exploratory Jupyter notebooks
  ├── datasets/           # HSI cubes, Audio samples
  └── models/             # Learned compression models / Unmixing Autoencoders
```

## 3. Algorithms Implementation strategy

### A. Laplacian Pyramid / Spectrograms
- Implement `spectrogram_utils.py`: Windowing functions (powers of 2), STFT wrappers.
- Implement `pyramid.py`: Encoding/Decoding image pyramids.

### B. Compression (ABD / FFT Mirroring)
- Create `quantization.py`: Adaptive Bit-Depth logic (Percentiles, code-ladders).
- Create `fft_codec.py`: Logic for FFT truncation and symmetric reconstruction.

### C. HSI Unmixing
- Implement `unmixing.py`: Endmember extraction (N-FINDR, PPI) and Abundance estimation using PyTorch optimization.

## 4. Metal Acceleration
- For very large HSI datacubes or long audio files, write custom Metal kernels for:
  - FFT (via `vkFFT` or Metal Performance Shaders).
  - Convolution operations.
  - Parallel histogram calculation for Adaptive Bit-Depth.

## 5. Verification
- **Unit Tests**: Verify "Lossless" really is lossless (assert delta == 0).
- **Visual Tests**: Generate differential maps (residual images) to visualize compression artifacts or unmixing errors.
