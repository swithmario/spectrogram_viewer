---
description: Workflow for Project Chimera, Physics Solvers, and Game Engine components
---

# Physics & Simulation Workflow (Chimera)

Use this workflow for high-performance physics solvers, light transport simulations, and engine components targeting Apple Silicon (Metal/MPS).

## 1. Environment & Technologies
- **Compute**: Metal (C++ / Swift) or PyTorch (MPS).
- **Core**: C++20 for engine code, Python for AI/ML control layers.

## 2. Directory Structure
```
project_root/
  ├── src/                # C++ / Metal source
  │   ├── solvers/        # Physics algorithms
  │   ├── render/         # Physically accurate shading
  │   └── audio/          # Physics audio engine
  ├── shaders/            # .metal files
  ├── python/             # ML orchestration / PINNs
  ├── tests/              # Verification tests
  └── data/               # Simulation data / LUTs
```

## 3. Component Setup

### A. Physics Solver SDK
- Implement base solver classes in C++.
- Create `ComputeShader.metal` templates for massively parallel calculations (e.g., fluid grids, wave solvers).
- Setup CMakeLists.txt or Xcode project to link Metal framework.

### B. Audio Engine (Physically Accurate)
- Define data structures for "Microphone-Speaker Pairs" and Frequency Response Tensors.
- Create stub for computing absorption/scattering transforms.

### C. Light Transport / Rendering
- Setup a basic path tracer harness using Metal Performance Shaders (Ray Intersector) if needed, or custom compute kernels for Volumetric Interpolation (Spherical Harmonics).

## 4. AI integration (PINNs / Agents)
- Setup PyTorch environment:
  `pip3 install --pre torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/nightly/cpu`
- Create `solver_agent.py` for AI that selects optimal algorithms.

## 5. Build & Verify
- Compile C++ metal bridge.
- Run a basic "Hello Compute" kernel to verify GPU access.
- Verify PyTorch can see the MPS device: `torch.backends.mps.is_available()`.
