---
description: Master workflow to setup specialized projects (Media, Physics, AI, Signal Processing)
---

# Project Setup Master Workflow

This workflow is the entry point for setting up any of the diverse project types defined in your portfolio.

1. **Identify Project Type**
   Determine which domain the new project falls into:
   - **Film & Media**: Video management, Immich wrappers, Resolve automation, Film cell projects.
   - **Physics & Simulation**: Project Chimera, Light transport, Physically accurate game engines.
   - **Signal Processing**: HSI, Audio/Spectrograms, Compression algorithms.
   - **Agentic AI**: Multi-agent simulations, RL environments, "Sims" style agents.

2. **Trigger Sub-Workflow**
   Based on the selection above, execute the corresponding workflow.

   - If **Film & Media**:
     - Run: `view_file .agent/workflows/media_workflow.md` locally to read instructions or ask the agent to "Run the media project workflow".

   - If **Physics & Simulation**:
     - Run: `view_file .agent/workflows/physics_sim_workflow.md` locally to read instructions or ask the agent to "Run the physics simulation workflow".

   - If **Signal Processing**:
     - Run: `view_file .agent/workflows/signal_processing_workflow.md` locally to read instructions or ask the agent to "Run the signal processing workflow".

   - If **Agentic AI**:
     - Run: `view_file .agent/workflows/agentic_ai_workflow.md` locally to read instructions or ask the agent to "Run the agentic AI workflow".

3. **Common Initialization (Optional)**
   If this is a brand new repository or workspace:
   - Ensure `.gitignore` is configured for the specific domain (e.g., ignoring large .mov files or .pt checkpoints).
   - Ensure Apple Silicon acceleration dependencies are noted (pip install --pre torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/nightly/cpu for MPS support).
