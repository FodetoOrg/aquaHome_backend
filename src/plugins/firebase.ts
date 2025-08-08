//@ts-nocheck
import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import admin, { ServiceAccount } from 'firebase-admin';
import * as dotenv from 'dotenv';

dotenv.config();

const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
if (!bucketName) {
  throw new Error('FIREBASE_STORAGE_BUCKET is not set in your environment');
}

declare module 'fastify' {
  interface FastifyInstance {
    firebase: admin.app.App;
    push: {
      send: (
        userId: string,
        title: string,
        message: string,
        referenceId?: string,
        referenceType?: string
      ) => Promise<void>;
    };
    storageBucket: admin.storage.Storage['bucket'];
    uploadToStorage: (
      file: Buffer,
      key: string,
      contentType: string
    ) => Promise<string>;
    getSignedUrl: (key: string) => Promise<string>;
  }
}

const base64Cred = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
if (!base64Cred) {
  throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
}

const serviceAccount = JSON.parse(
  Buffer.from(base64Cred, 'base64').toString('utf8')
) as ServiceAccount;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: bucketName,
  });
}

export default fp(async (fastify: FastifyInstance) => {
  const app = admin.app();
  fastify.decorate('firebase', app);

  // PUSH helper
  fastify.decorate('push', {
    send: async (
      userId,
      title,
      message,
      referenceId?,
      referenceType?
    ) => {
      // your existing push logic here, e.g. fetch tokens & call app.messaging().sendMulticast(...)
    },
  });

  // STORAGE helpers
  const bucket = admin.storage().bucket();
  fastify.decorate('storageBucket', bucket);

  fastify.decorate(
    'uploadToStorage',
    async (file: Buffer, key: string, contentType: string) => {
      const remoteFile = bucket.file(key);
      await remoteFile.save(file, {
        metadata: { contentType },
        public: true,
      });
      return `https://storage.googleapis.com/${bucket.name}/${key}`;
    }
  );

  fastify.decorate('getSignedUrl', async (key: string) => {
    const remoteFile = bucket.file(key);
    const [url] = await remoteFile.getSignedUrl({
      action: 'read',
      expires: Date.now() + 5 * 60 * 1000,
    });
    return url;
  });

  fastify.log.info('Firebase plugin (push + storage) registered');
  
  fastify.addHook('onClose', async () => {
    await app.delete();
    fastify.log.info('Firebase connection closed');
  });
});
