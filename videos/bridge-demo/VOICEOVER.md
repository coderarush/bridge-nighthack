# Bridge Demo Voiceover

The rendered video is silent and runs for 48 seconds at 24 fps.

## 0:00-0:05

AtlasPay removes `payment_method` and requires `payment_method_id`. That breaking
contract can stop customer code.

## 0:05-0:12

Bridge maps the change through a bounded TypeScript recipe to three guarded
request objects, while look-alike strings stay untouched.

## 0:12-0:18

A deterministic AST patch renames only those proven keys. This is not a broad
search and replace.

## 0:18-0:25

Bridge commits the patch and opens a real draft pull request. It never
auto-merges.

## 0:25-0:36

The base is red on the deprecated fields. The patch turns the PR head green,
and Bridge accepts CI only when the check SHA exactly matches the current PR
head.

## 0:36-0:44

Provider and customer review the contract, code, CI evidence, comments, and
approval in one shared migration room.

## 0:44-0:48

Dependabot bumps versions. Bridge carries breaking API changes to a verified
migration PR.

## One-liner

Bridge turns breaking API changes into deterministic, exact-SHA-verified draft
PRs that humans approve.
