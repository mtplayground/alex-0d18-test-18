CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL CHECK (length(trim(filename)) > 0),
  storage_key text NOT NULL UNIQUE CHECK (length(trim(storage_key)) > 0),
  content_type text NOT NULL CHECK (length(trim(content_type)) > 0),
  size bigint NOT NULL CHECK (size > 0),
  dimensions jsonb NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT images_dimensions_shape CHECK (
    jsonb_typeof(dimensions) = 'object'
    AND dimensions ? 'width'
    AND dimensions ? 'height'
    AND jsonb_typeof(dimensions -> 'width') = 'number'
    AND jsonb_typeof(dimensions -> 'height') = 'number'
    AND (dimensions ->> 'width')::numeric > 0
    AND (dimensions ->> 'height')::numeric > 0
  )
);

CREATE INDEX images_uploaded_at_id_idx ON images (uploaded_at DESC, id DESC);
