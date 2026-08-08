import { randomUUID } from "crypto";

/**
 * Abstraction du stockage de fichiers privés (vidéos, PDF).
 * Implémentation par défaut : stub qui simule un provider S3-compatible
 * (AWS S3, Cloudflare R2, Backblaze B2...). Remplacer `uploadBuffer` et
 * `getSignedDownloadUrl` par de vrais appels SDK quand les identifiants
 * seront configurés dans .env — le reste de l'application n'a pas à changer.
 */
export interface StorageProvider {
  uploadBuffer(buffer: Buffer, originalName: string, folder: string): Promise<string>; // retourne la storageKey
  getSignedDownloadUrl(storageKey: string, expiresInSeconds?: number): Promise<string>;
  deleteObject(storageKey: string): Promise<void>;
}

class StubStorageProvider implements StorageProvider {
  async uploadBuffer(_buffer: Buffer, originalName: string, folder: string): Promise<string> {
    const ext = originalName.split(".").pop();
    return `${folder}/${randomUUID()}.${ext}`;
  }

  async getSignedDownloadUrl(storageKey: string, expiresInSeconds = 3600): Promise<string> {
    // En production : générer une URL signée temporaire (ex: AWS.S3.getSignedUrlPromise)
    // afin que le fichier privé ne soit JAMAIS exposé publiquement.
    const expires = Date.now() + expiresInSeconds * 1000;
    return `https://storage.example.com/${storageKey}?expires=${expires}&signature=stub`;
  }

  async deleteObject(_storageKey: string): Promise<void> {
    // no-op pour le stub
  }
}

export const storage: StorageProvider = new StubStorageProvider();
