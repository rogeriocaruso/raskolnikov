# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Run the development server:**
```bash
python run.py
```

**Seed the database with RS OPOs, EDOTs, and a default admin user:**
```bash
python seed.py
# admin credentials: admin@cet.gov.br / senha123
```

**Run database migrations:**
```bash
flask db migrate -m "description"
flask db upgrade
```

**Lint:**
```bash
flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics
flake8 . --count --exit-zero --max-complexity=10 --max-line-length=127 --statistics
```

**Run tests:**
```bash
pytest
```

## Architecture

This is a Flask REST API for organ donor tracking in the Rio Grande do Sul transplant network (Brazil). There are no frontend files — it is a pure JSON API.

### Domain hierarchy

```
OPO (Organ Procurement Organization, state-level)
 └── EDOT (hospital-level transplant team)
      ├── Setor (ward/unit within hospital)
      └── Paciente (potential organ donor patient)
           └── PacienteHistorico (field-level audit log)
```

`Usuario` belongs to either an OPO (for `opo_auditor`) or an EDOT (for `edot_coord`/`edot_membro`), or neither (for `cet_admin`).

### Authorization model

Four roles defined in `models.PERFIS`:
- `cet_admin` — full access across all OPOs/EDOTs
- `opo_auditor` — read/write access to all EDOTs under their OPO
- `edot_coord` — read/write access to their own EDOT only; can create/archive patients
- `edot_membro` — read-only access to their own EDOT

Access control is enforced per-request via `_check_edot_access()` in `routes/patients.py`, which reads claims from the JWT. JWT claims carry `perfil`, `edot_id`, `opo_id`, and `user_id`.

### Key conventions

- **Soft delete only**: patients are never hard-deleted; use `POST /patients/<id>/arquivar` which sets `arquivado=True`.
- **Audit log**: every field mutation on `Paciente` writes a `PacienteHistorico` row via `_write_historico()`. Only fields listed in `MUTABLE_FIELDS` (`routes/patients.py:11`) can be updated.
- **`to_dict()` on all models**: used for all JSON responses; `Paciente.to_dict(include_historico=True)` embeds the audit trail.
- **`prontuario` is uppercased and unique per EDOT** (enforced by DB constraint `uq_prontuario_edot`).
- **Pagination**: patient list defaults to 20 per page, max 100; uses Flask-SQLAlchemy `.paginate()`.
- **`STATUS_PACIENTE`** (`models.py:9`) is the authoritative list of valid patient statuses; validate against it before persisting.

### Configuration

`config.py` maps environment names to config classes via `config_map`. `FLASK_ENV` selects the config; defaults to `development`. Production requires `DATABASE_URL` env var (no fallback). JWT expiry is 8 hours.

### Adding a new route

1. Add a blueprint in `routes/`.
2. Register it in `app.create_app()` with `app.register_blueprint(...)`.
3. Protect with `@jwt_required()` and check `_check_edot_access()` for patient-scoped resources.
