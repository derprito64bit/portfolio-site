# portfolio-site

The source of derprito64bit's portfolio at **https://derprito64bit.github.io/**: one portfolio of all the owner's
work, fast on any hardware (D-023).

One of its projects, the owner's Unity game (the Manor), is served at `/manor/` from
[`derprito64bit/derprito64bit.github.io`](https://github.com/derprito64bit/derprito64bit.github.io). On this site it is
one project with its own page. The plan and the locked decisions are in [`docs/direction/`](docs/direction/) and
[`docs/agents/decisions.md`](docs/agents/decisions.md).

## One domain, two repos

| Path | Served from |
|---|---|
| `/` and everything not listed below | this repo's build |
| `/manor/**` | the fork's Unity build |
| `/play/**` | the fork: a redirect to `/manor/` that keeps the query string and hash |
| `/arcade/**` | the fork's `site/arcade/` |

The fork's `scripts/fork/publish.ps1` composes both repos into the fork's `gh-pages` branch. **GitHub Pages stays
off for this repo**, so the site exists at one address only.

## Content is placeholder until the owner confirms it

[`content/`](content/) is the one source of truth for the site and the game. The Manor repo copies it into the game.

- Every entry carries `"placeholder": true` until the owner confirms it.
- [`content/owner-facts.md`](content/owner-facts.md) is the only source of facts about the owner. Nothing else
  may be stated as fact, and nobody invents details to fill a layout.

## Licence

- Code: MIT, see [`LICENSE`](LICENSE).
- Everything in `content/` and all media (images, video, audio, 3D models) anywhere in the repo: all rights
  reserved, see [`CONTENT-LICENSE.md`](CONTENT-LICENSE.md).

## Agents start here

[`docs/agents/PROTOCOL.md`](docs/agents/PROTOCOL.md) covers how work is claimed, checkpointed, reviewed and resumed.
The rules every prompt includes are in [`docs/agents/blocks/`](docs/agents/blocks/).
