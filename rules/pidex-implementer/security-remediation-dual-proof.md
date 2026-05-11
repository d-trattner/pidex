# Security Remediation Dual Proof

PROC-NEW: 020-2

## Trigger
Slice includes security remediation (authz/authn/input validation/secret handling/injection hardening).

## Rule
Implementer must provide dual proof in same change set:
1. Adversarial proof: exploit/abuse path now rejected (test/log/evidence).
2. Fresh-run happy-path proof: legitimate runtime path still succeeds after remediation.

## Required evidence
- One negative test or reproducible command proving attack path blocked.
- One fresh-run positive test/command proving intended flow works.
- Both results recorded in implementation doc validation section.

## Failure mode prevented
Security fix closes exploit but silently breaks normal execution.
