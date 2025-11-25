CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.7

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



SET default_table_access_method = heap;

--
-- Name: productos_referencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.productos_referencia (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    titulo text NOT NULL,
    precio text NOT NULL,
    imagen_url text NOT NULL,
    tienda text NOT NULL,
    temporada text NOT NULL,
    categoria text NOT NULL,
    colores text[] DEFAULT '{}'::text[],
    tallas text[] DEFAULT '{}'::text[],
    ventas_estimadas integer DEFAULT 0,
    descripcion text,
    trend_score numeric(3,1) DEFAULT 7.0,
    notas text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT productos_referencia_categoria_check CHECK ((categoria = ANY (ARRAY['todos'::text, 'tejidos'::text, 'tops'::text, 'vestidos'::text, 'pantalones'::text, 'conjuntos'::text]))),
    CONSTRAINT productos_referencia_temporada_check CHECK ((temporada = ANY (ARRAY['caliente'::text, 'frio'::text, 'todos'::text]))),
    CONSTRAINT productos_referencia_trend_score_check CHECK (((trend_score >= 1.0) AND (trend_score <= 10.0)))
);


--
-- Name: productos_referencia productos_referencia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos_referencia
    ADD CONSTRAINT productos_referencia_pkey PRIMARY KEY (id);


--
-- Name: idx_productos_ref_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_productos_ref_categoria ON public.productos_referencia USING btree (categoria);


--
-- Name: idx_productos_ref_temporada; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_productos_ref_temporada ON public.productos_referencia USING btree (temporada);


--
-- Name: idx_productos_ref_tienda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_productos_ref_tienda ON public.productos_referencia USING btree (tienda);


--
-- Name: idx_productos_ref_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_productos_ref_user ON public.productos_referencia USING btree (user_id);


--
-- Name: productos_referencia Permitir actualización pública; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir actualización pública" ON public.productos_referencia FOR UPDATE USING (true);


--
-- Name: productos_referencia Permitir eliminación pública; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir eliminación pública" ON public.productos_referencia FOR DELETE USING (true);


--
-- Name: productos_referencia Permitir inserción pública; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir inserción pública" ON public.productos_referencia FOR INSERT WITH CHECK (true);


--
-- Name: productos_referencia Permitir lectura pública; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir lectura pública" ON public.productos_referencia FOR SELECT USING (true);


--
-- Name: productos_referencia; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.productos_referencia ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


