# CI trigger policy

Pull requests to any branch retain the complete existing validation suite. Only `main` pushes run independently; feature pushes use their PR result instead of starting a duplicate hosted run. Open a PR for validation of a feature branch. Manual dispatch remains available once this workflow is present on the default branch.

Only newer revisions of the same PR cancel older PR runs. Default and manual runs have unique groups. No job, test, dependency audit, service fixture, runtime, permission, or deployment behavior is changed. This CI-only follow-up targets the existing integration review branch; it does not approve application integration into `main`.

Rollback: revert this CI-only commit to restore the previous trigger configuration. Preserve source branches and evidence. Savings remain unmeasured until real eligible events occur; a green validation run is validation overhead, not an avoided run.
