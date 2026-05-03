// src/db/migrations/20240101000001_create_images_table.js

exports.up = function (knex) {
  return knex.schema
    .createTable('images', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('original_filename', 255).notNullable();
      table.string('stored_filename', 255).notNullable();
      table.string('s3_key', 500);
      table.string('s3_url', 1000);
      table.string('thumbnail_s3_key', 500);
      table.string('thumbnail_s3_url', 1000);
      table.string('mime_type', 100).notNullable();
      table.string('original_format', 20).notNullable(); // heic, png, jpeg
      table.string('converted_format', 20); // png or jpeg (if converted from heic)
      table.bigInteger('file_size_bytes').notNullable();
      table.integer('width').notNullable();
      table.integer('height').notNullable();
      table
        .enu('status', ['pending', 'accepted', 'rejected', 'processing'])
        .notNullable()
        .defaultTo('pending');
      table.jsonb('validation_results').defaultTo('{}');
      table.text('rejection_reasons');
      table.string('perceptual_hash', 64); // for similarity detection
      table.float('blur_score');
      table.integer('face_count').defaultTo(0);
      table.float('face_area_ratio');
      table.string('session_id', 100); // group uploads by session
      table.string('ip_address', 45);
      table.timestamps(true, true);

      // Indexes for performance
      table.index('status');
      table.index('session_id');
      table.index('perceptual_hash');
      table.index('created_at');
      table.index(['status', 'created_at']);
    })
    .createTable('upload_sessions', (table) => {
      table.string('id', 100).primary();
      table.string('ip_address', 45);
      table.integer('total_uploaded').defaultTo(0);
      table.integer('total_accepted').defaultTo(0);
      table.integer('total_rejected').defaultTo(0);
      table.timestamps(true, true);
    });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('images').dropTableIfExists('upload_sessions');
};
