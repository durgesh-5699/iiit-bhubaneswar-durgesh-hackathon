## Run with Docker (alternative to the Node quickstart)

Needs Docker Desktop (or Docker Engine with the Compose plugin). One command builds and starts the API and the dashboard:

```bash
git clone https://github.com/durgesh-5699/iiit-bhubaneswar-durgesh-hackathon.git
cd iiit-bhubaneswar-durgesh-hackathon
docker compose up --build
```

- Dashboard: http://localhost:8080
- API health check: http://localhost:4000/health
- Stop everything: `docker compose down`

The first build takes a few minutes. Signals are precomputed during the image build, so the API is ready as soon as it starts.

| Option | Command |
|---|---|
| Hybrid engine (FinBERT + zero-shot) for the live analyzer | `USE_MODELS=1 docker compose up --build` (models download on first start and are cached in a volume) |
| MongoDB instead of JSON files | `MONGODB_URI=mongodb://mongo:27017/risk_engine docker compose --profile mongo up --build`, then `docker compose exec api npm run seed:mongo` |
| Real Yahoo prices | Run `npm run fetch:prices` in `src/server` before building, or commit `data/prices.csv`; otherwise synthetic fallback prices are used |

On Windows PowerShell, set variables first: `$env:USE_MODELS=1; docker compose up --build`.
