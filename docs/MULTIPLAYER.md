# Blokkverden multiplayer

Separate Cloudflare Worker (`blokkverden-mp`) with one Durable Object per 5-letter room code.
Architecture mirrors Heddas verden (`src/mp/*` shared with the DO; `server/` is the Worker).

## Roles

- **Host** creates a room (Sammen → Lag rom). Their seed + modified chunks are authoritative.
- **Joiners** enter the code, receive `welcome` (seed) then `world` (modified chunks), and play in the host world.
- Max **4** players. Host leaving sends `host-left` and closes the room.

## Synced

- Player position / yaw / pitch / pose + simple nametag model
- Block place / break
- Door / gate / trapdoor open state (meta bit)
- Dropped items (spawn + first-wins take; no duplication at the room layer)

## Not synced (documented)

- **Mobs** are host-simulated only for now; joiners do not see host mob AI. Prefer creative building sessions or accept divergent wildlife.
- Inventory, XP, hunger, containers, boats, projectiles, weather — local.

## Local test

```bash
# terminal A
cd server && npm run dev   # wrangler dev on :8788 --local

# terminal B
VITE_MP_URL=ws://127.0.0.1:8788 npm run dev
```

Open two browsers → Sammen → host / join.

## Deploy (requires Thomas approval)

- Worker name: `blokkverden-mp`
- Live Worker: `https://blokkverden-mp.heddasverden.workers.dev` (WSS: `wss://blokkverden-mp.heddasverden.workers.dev`)
- Pages build injects `VITE_MP_URL` from the GitHub repo variable of the same name
- GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- Workflow: `.github/workflows/mp-server.yml` (`workflow_dispatch` only — no auto-deploy)

Do **not** deploy the Worker or publish Pages without explicit approval.
