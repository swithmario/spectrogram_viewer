---
description: Workflow for Agentic AI, Sims-like environments, and Multi-Agent Collaboration
---

# Agentic AI & Simulation Workflow

Use this workflow for "Sims"-style agent networks, verifiable code generation swarms, and reinforcement learning environments.

## 1. Architecture Choice
- **Local vs Server**: Determine if running on Mac Mini (Local LLMs via MLX/Llama.cpp) or API based.
- **Framework**: `LangGraph`, `AutoGen`, or custom `Actor` pattern implementation.

## 2. Directory Structure
```
project_root/
  ├── agents/             # Agent definitions (Personalities, System Prompts)
  ├── environment/        # The "Virtual Space" (Minecraft bridge, Simulation state)
  ├── memory/             # Vector DB or JSON logs of agent interactions
  └── verification/       # Sandbox for executing agent-generated code
```

## 3. Key Components

### A. The Agents
- Define `BaseAgent` class with:
  - `think()`: Chain of thought loop.
  - `act()`: Tool usage.
  - `observe()`: Reading environment state.
- Implement specific roles (e.g., "Coder", "Verifier", "PhysicsExpert").

### B. The Environment
- If "Sims in a Box": Create a state manager `world_state.py` tracking locations, interactions, and "verifiable problems" queue.
- If "Game Bridge" (e.g., Minecraft): Setup socket connection or mod-bridge to standard API.

### C. Verifiable RL Loop
- Implement `TaskEvaluator`: Automatic checking of agent outputs (Unit tests pass? Physics simulation converges?).
- Implement `Distillation`: Script to fine-tune smaller local models on successful agent trajectories (Apple MLX recommended for M3 Max).

## 4. Mac Optimization (MLX)
- Use `mlx-lm` for local inference of agent brains on M3 Max.
- Ensure unified memory is utilized efficiently (batch requests if possible).

## 5. Running the Simulation
- Create `run_simulation.py`: Main loop that ticks the environment and triggers agent steps.
- Dashboard: Simple web-ui or CLI to watch agent logs in real-time.
