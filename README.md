# MaxNPM - A More Rational npm Client

MaxNPM is a npm client that utilizes [PacSolve](https://github.com/donald-pinckney/pacsolve), a
dependency solver using [Rosette](https://github.com/emina/rosette) (a Z3-based SAT solver),
to find the optimal dependency graph for a given set of dependencies. It offers several benefits over traditional npm,
including minimizing the size of the node_modules folder by reducing the number of dependencies,
improving the management of project vulnerabilities more effectively than `npm audit fix`,
reducing the number of duplicate dependencies (that is multiple versions of the same dependency),
and allowing users to choose the latest compatible version of a dependency with better results than a normal npm install.

The MaxNPM paper can be found [here](https://arxiv.org/abs/2203.13737).

### Installation

MaxNPM can be installed by simply running `npm install -g maxnpm`.
The binaries included in the package in the npm registry are built for Linux version >= 4.10.
For earlier versions of Linux or other operating systems, you will need to build MaxNPM from source.

### Usage

MaxNPM can be used as a drop-in replacement for npm by specifying the `--maxnpm` flag when running
`maxnpm install`, as it uses the same interface as npm (except for the `maxnpm` binary prefix).
Constraints are specified using the flag `--minimize <constraint1>,<constraint2>,...`,
where the precedence of the constraints is the order in which they are specified.

Out of the box, we currently support the following constraints:

- `min_oldness`: minimizes the number of installed old versions
- `min_num_deps`: minimizes the number of dependencies
- `min_duplicates`: minimizes the number of duplicate dependencies
- `min_cve`: minimizes the number of vulnerabilities

For example, if you want to minimize the number of old versions and the number of vulnerabilities,
you would run `maxnpm install --maxnpm --minimize min_oldness,min_cve`.
