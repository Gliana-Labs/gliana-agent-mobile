/**
 * SNAP — point the phone at something, restyle it, enter it in the arena.
 *
 * The one thing this app can do that a laptop cannot. It exists because the
 * chat is a blank page: "describe what to make" is a hard question, while
 * "photograph your desk and make it 8-bit" is not a question at all. On a phone
 * the camera IS the prompt.
 *
 * It produces the SAME proposal shape the agent emits, so the card, the price,
 * the wallet approval, the result view and the arena entry are all the existing
 * code. Nothing about payment is special here — which is the point: a second
 * way to pay would be a second thing to get wrong.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { API, quote, type Proposal } from './api';

/**
 * Restyling is an IMAGE-EDITING job, and flux-1-kontext-pro is the cheapest
 * enabled model here that genuinely edits a photo rather than taking it as a
 * style hint ($0.048/call). krea's `image_style_references` and grok's `image`
 * both borrow a look; kontext keeps your subject and changes the world around
 * it, which is what "make my desk 8-bit" means.
 */
export const SNAP_MODEL = 'flux-1-kontext-pro';
const SNAP_FIELD = 'input_image';

/**
 * Six looks, written as instructions to an editor rather than as prompts.
 *
 * Each one says what to KEEP as well as what to change: an edit model given
 * only a style ("make it 8-bit") will happily replace your subject with a
 * stock one, and the photo you just took stops being yours.
 */
export interface SnapStyle {
  id: string;
  label: string;
  hint: string;
  prompt: string;
}

export const SNAP_STYLES: SnapStyle[] = [
  {
    id: 'pixel',
    label: 'PIXEL',
    hint: '8-bit sprite',
    prompt:
      'Redraw this exact scene as 8-bit pixel art with a limited palette and hard pixel edges. Keep the same subject, composition and colours recognisable.',
  },
  {
    id: 'neon',
    label: 'NEON',
    hint: 'rainy night, 35mm',
    prompt:
      'Relight this exact scene as a rainy neon night, wet reflections, shot on 35mm film. Keep the subject and composition; change only the light and atmosphere.',
  },
  {
    id: 'clay',
    label: 'CLAY',
    hint: 'stop-motion',
    prompt:
      'Remake this exact scene as handmade claymation with visible fingerprints and soft studio light. Keep the subject and composition.',
  },
  {
    id: 'ink',
    label: 'INK',
    hint: 'brush and paper',
    prompt:
      'Redraw this exact scene as black brush ink on rough paper, bold strokes, no colour. Keep the subject and composition.',
  },
  {
    id: 'kaiju',
    label: 'KAIJU',
    hint: 'city-scale monster',
    prompt:
      'Keep the main subject of this photo exactly as it is, but place it at city scale towering over a small town at dusk, in the style of a rubber-suit monster film.',
  },
  {
    id: 'poster',
    label: 'POSTER',
    hint: 'travel print',
    prompt:
      'Turn this exact scene into a mid-century travel poster: flat shapes, three-colour print, grainy paper. Keep the subject and composition recognisable.',
  },
];

export class SnapError extends Error {}


/** Upload to R2 through the gateway and get back the hosted URL the model reads. */
export async function uploadPhoto(uri: string): Promise<string> {
  const up = await FileSystem.uploadAsync(`${API}/v1/media`, uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { 'content-type': 'image/jpeg' },
  });
  if (up.status < 200 || up.status >= 300) throw new SnapError('Upload failed — check your connection and try again.');
  const url = (JSON.parse(up.body) as { url?: string }).url;
  if (!url) throw new SnapError('Upload failed — the gateway returned no URL.');
  return url;
}

/**
 * Build the proposal for a photo + style.
 *
 * The quote comes from the gateway rather than a constant, for the same reason
 * every other price here does: the catalog is the single source, and a price
 * hardcoded in an app is a price that goes stale without anybody noticing.
 */
export async function snapProposal(photoUrl: string, style: SnapStyle): Promise<Proposal> {
  const input: Record<string, unknown> = { [SNAP_FIELD]: photoUrl, prompt: style.prompt };
  return {
    kind: 'model',
    endpoint: '/v1/infer',
    model: SNAP_MODEL,
    category: 'text-to-image',
    input,
    quote: await quote(SNAP_MODEL, input),
  };
}
