# Package Source Reference Context

Packref provides project-aligned dependency source for coding agents. This glossary defines the
language used across the CLI, specification, architecture, and implementation.

## Packages and sources

**Package identity**:
The registry, package name, and exact version that uniquely identify a package source reference.
_Avoid_: Package key, package spec

**Package spec**:
A user-supplied package name with an optional version or range that must resolve to a package
identity.
_Avoid_: Package identity, dependency

**Package source**:
The repository snapshot or published tarball from which Packref obtains source for a package
identity.
_Avoid_: Package provider, registry

**Source snapshot**:
An immutable source tree fetched for one package identity and retained in the global store.
_Avoid_: Clone, dependency install

**Package source reference**:
A project-local, agent-readable source tree materialized from a source snapshot for one package
identity.
_Avoid_: Dependency, installed package, package copy

**Registry**:
The package ecosystem that owns package identities and metadata; npm is the only registry supported
in v1.
_Avoid_: Repository host, provider

**Repository host**:
The service hosting a package's source repository, distinct from the registry that publishes the
package.
_Avoid_: Registry, package provider

## Project state

**Packref lockfile**:
The committed record of package identities, source metadata, and tracking modes that is
authoritative for reproducing a project's package source references.
_Avoid_: Dependency lockfile, cache index

**Materialization**:
Creating a project-local package source reference from the matching global source snapshot.
_Avoid_: Install, fetch

**Dependency-tracked reference**:
A package source reference whose exact version follows a dependency declared by the project.
_Avoid_: Automatic reference, installed dependency

**Manual reference**:
A package source reference whose version is independent of project dependency reconciliation.
_Avoid_: Pinned dependency, unmanaged reference

**Registered project**:
A project path known to Packref so its lockfile can protect source snapshots during global pruning.
_Avoid_: Workspace, active project

## Storage

**Global store**:
The user-level collection of deduplicated source snapshots shared by registered projects.
_Avoid_: Cache, registry

**Project source directory**:
The ignored `.packref/packages/` tree containing materialized package source references for one
project.
_Avoid_: Vendor directory, node_modules
