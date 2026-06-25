-- ============================================================
-- Spoty seed data: artists + catalog
-- Audio keys map to objects uploaded into the MinIO "audio" bucket
-- by the audio-gen + minio-init containers (track-XX.wav).
-- ============================================================

INSERT INTO artists (name, genre) VALUES
    ('Neon Skyline', 'pop'),
    ('Bass Theory',  'electronic'),
    ('The Quiet Hours', 'lofi'),
    ('Crimson Avenue', 'rock'),
    ('Aurora Beats', 'electronic'),
    ('Velvet Echo', 'pop');

-- songs reference artists by id (1..6 in insertion order)
INSERT INTO songs (title, artist_id, genre, duration_sec, audio_key, cover_url, premium_only) VALUES
    ('Midnight Drive',     1, 'pop',        200, 'track-01.wav', 'https://picsum.photos/seed/1/300', false),
    ('Electric Sunset',    1, 'pop',        185, 'track-02.wav', 'https://picsum.photos/seed/2/300', false),
    ('Subwoofer Dreams',   2, 'electronic', 220, 'track-03.wav', 'https://picsum.photos/seed/3/300', false),
    ('Voltage',            2, 'electronic', 240, 'track-04.wav', 'https://picsum.photos/seed/4/300', true),
    ('Rainy Window',       3, 'lofi',       160, 'track-05.wav', 'https://picsum.photos/seed/5/300', false),
    ('Study Session',      3, 'lofi',       175, 'track-06.wav', 'https://picsum.photos/seed/6/300', false),
    ('Broken Highway',     4, 'rock',       210, 'track-07.wav', 'https://picsum.photos/seed/7/300', false),
    ('Red Lights',         4, 'rock',       195, 'track-08.wav', 'https://picsum.photos/seed/8/300', true),
    ('Polar Pulse',        5, 'electronic', 230, 'track-09.wav', 'https://picsum.photos/seed/9/300', false),
    ('Northern Glow',      5, 'electronic', 205, 'track-10.wav', 'https://picsum.photos/seed/10/300', false),
    ('Soft Spoken',        6, 'pop',        180, 'track-11.wav', 'https://picsum.photos/seed/11/300', false),
    ('Echo Chamber',       6, 'pop',        190, 'track-12.wav', 'https://picsum.photos/seed/12/300', true);
-- Demo user accounts are created at startup by auth-service (bootstrapDemoUsers)
-- with real bcrypt hashes. Default password for all demo users: Passw0rd!
--   admin@spoty.dev (admin) | premium@spoty.dev (premium) | free@spoty.dev (free)
