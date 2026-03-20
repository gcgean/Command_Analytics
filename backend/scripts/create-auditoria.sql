-- Script: create-auditoria.sql
-- Cria a tabela de auditoria do sistema.
-- Execute uma única vez no banco de dados.

CREATE TABLE IF NOT EXISTS auditoria (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  tabela           VARCHAR(100) NOT NULL,
  registro_id      INT NOT NULL,
  acao             VARCHAR(20) NOT NULL,          -- CRIACAO | ALTERACAO | EXCLUSAO | STATUS
  usuario_id       INT NULL,
  usuario_nome     VARCHAR(200) NULL,
  dados_antes      TEXT NULL,                     -- JSON com estado anterior
  dados_depois     TEXT NULL,                     -- JSON com estado posterior
  campos_alterados TEXT NULL,                     -- JSON array com campos que mudaram
  criado_em        DATETIME NOT NULL DEFAULT NOW(),
  INDEX idx_tabela_registro (tabela, registro_id),
  INDEX idx_usuario (usuario_id),
  INDEX idx_criado_em (criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
