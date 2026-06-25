-- ============================================================
-- Spoty schema (PostgreSQL 18)
-- Relational store: users, catalog, playlists + analytics rollups
-- ============================================================

-- trigram extension so catalog ILIKE '%q%' search is index-accelerated
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'free' CHECK (role IN ('free', 'premium', 'admin')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE artists (
    id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name  TEXT NOT NULL,
    genre TEXT NOT NULL
);

CREATE TABLE songs (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title        TEXT NOT NULL,
    artist_id    BIGINT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    genre        TEXT NOT NULL,
    duration_sec INT  NOT NULL DEFAULT 180,
    audio_key    TEXT NOT NULL,        -- object key in MinIO/Blob
    cover_url    TEXT,
    premium_only BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_songs_genre ON songs(genre);
-- trigram index used by the catalog ILIKE search on title
CREATE INDEX idx_songs_title_trgm ON songs USING gin (title gin_trgm_ops);

CREATE TABLE playlists (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE playlist_songs (
    playlist_id BIGINT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    song_id     BIGINT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    position    INT NOT NULL DEFAULT 0,
    PRIMARY KEY (playlist_id, song_id)
);

-- ------------------------------------------------------------
-- Analytics rollups written by the PySpark Structured Streaming job.
-- NOTE: user identifiers are stored ONLY as salted hashes here
-- (pseudonymized) to satisfy GDPR/CCPA data-minimization.
-- ------------------------------------------------------------
CREATE TABLE song_play_counts (
    song_id      BIGINT NOT NULL,
    genre        TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    window_end   TIMESTAMPTZ NOT NULL,
    play_count   BIGINT NOT NULL,
    PRIMARY KEY (song_id, window_start)
);
CREATE INDEX idx_spc_window ON song_play_counts(window_start DESC);

-- Distinct (pseudonymous) listeners per song per window
CREATE TABLE song_unique_listeners (
    song_id          BIGINT NOT NULL,
    window_start     TIMESTAMPTZ NOT NULL,
    unique_listeners BIGINT NOT NULL,
    PRIMARY KEY (song_id, window_start)
);

-- Per-user recommendation seeds (top genres), user stored pseudonymously
CREATE TABLE user_genre_affinity (
    user_hash  TEXT NOT NULL,   -- HMAC(user_id) — never the raw id
    genre      TEXT NOT NULL,
    play_count BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_hash, genre)
);
