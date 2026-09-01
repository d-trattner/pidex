# PIDEX Angular task router

Choose references after inspecting the actual workspace.

| Task | Base references | Conditional profile | Minimum evidence |
|---|---|---|---|
| New application | constrained PIDEX new-application procedure plus official CLI, components and routing references | Material and/or Nx only when selected | install/lock review, build, initial tests |
| Feature/change | task-specific official Angular references | Material when touched; Nx when workspace detected | focused tests, build, affected scope where available |
| Modernization | migrations plus current/target version docs | Nx migration/profile when applicable | migration plan, incremental build/test, rollback point |
| Defect | relevant API/testing references | profile owning the failing layer | reproducing test, focused fix, regression test |
| Test/quality | official testing/harness/E2E references | Material harnesses; Nx affected targets | deterministic test output and limitations |
| Architecture | routing/rendering/DI/data references | L/XL and Nx profile | boundaries, dependency graph, representative change |

Scale is evidence-driven, not line-count only. Use S for a local change, M for several collaborating features, L for multiple domains/libraries or operational rendering complexity, and XL for Nx multi-app/multi-library or major migration work.
