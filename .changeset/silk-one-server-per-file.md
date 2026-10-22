---
"silk": patch
---

Each Silk file now has one language server. Opening a file outside the workspace folders, such as a standard library file reached by go to definition, no longer starts a second server that also attaches to every other file, which made each hover appear twice. A folder's server also serves the standard library its toolchain reads, so language features keep working after go to definition into the library. Other files outside every folder share one server that serves only them.
