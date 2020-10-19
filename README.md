# WebIDL-NAPI

This project aims to provide a compiler that consumes a WebIDL file and produces
a C++ source file containing code that defines the interfaces specified in the
WebIDL file using N-API. It is intended to be used as part of a project's build
infrastructure.

# Installation

Since this is an npm package it requires a version of [Node.js][] to run.

To install, run

```bash
npm -g install webidl-napi
```

Afterwards, the command `webidl-napi` will become available from the command
line.

# Usage

Once installed, please run

```bash
webidl-napi --help
```

to see a full list of options. At its most basic, running

```bash
webidl-napi -o output.cc input.idl
```

will process file `input.idl` and create file `output.cc` containing the
bindings described by `input.idl`.

[Node.js]: https://nodejs.org/
