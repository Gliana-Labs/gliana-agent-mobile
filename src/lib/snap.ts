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
 * Seven looks, written as instructions to an EDITOR, and in a deliberate order:
 * what must STAY comes first, what changes comes second.
 *
 * This is not stylistic. flux-1-kontext-pro follows the first strong
 * instruction it reads. "Transform this into a giant mecha, keep its colours"
 * produced a stock robot in a stock room with nothing of the photograph left —
 * the replacement instruction won and the hedge was ignored. Leading with
 * "keep this exact photograph, same framing, same background" and describing
 * the change as a modification OF THAT OBJECT keeps the subject in the frame.
 *
 * The opposite failure is just as easy: leading with a wall of "keep the same
 * framing, background, lighting, colours" produced results indistinguishable
 * from the input photo. Both extremes were tried on the same picture.
 *
 * What works is the middle, and the order is the trick: NAME THE CHANGE, then
 * map it onto the object's own parts ("its panels become the torso, its fans
 * become the eyes"), then pin the room last. The model needs something to build
 * FROM; given that, it keeps the table, the curtain and the cable on the floor.
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
    id: 'mecha',
    label: 'MECHA',
    hint: 'it transforms',
    prompt:
      'Turn the machine in this photo into a standing humanoid robot built FROM ' +
      'that machine itself: its case panels become the torso and armour plates, ' +
      'its fans and lights become the glowing chest vents and eyes, its cables ' +
      'become cabling across the joints, and arms and legs unfold from its own ' +
      'chassis. Keep its exact colour scheme and materials, and keep the same ' +
      'room, same surface, same camera angle and same lighting.',
  },

  {
    id: 'pixel',
    label: 'PIXEL',
    hint: '8-bit sprite',
    prompt:
      'Redraw this exact photograph as 8-bit pixel art: chunky visible pixels, a ' +
      'limited palette sampled from the photo\'s own colours, hard aliased edges, ' +
      'flat shading. Keep the same framing, the same subject in the same position ' +
      'and the same background layout, so it is clearly this photo as a game ' +
      'sprite. Do not invent a different scene.',
  },
  {
    id: 'neon',
    label: 'NEON',
    hint: 'rainy night, 35mm',
    prompt:
      'Keep this exact photograph: same framing, same subject, same background ' +
      'geometry. Change only the light and the weather — rain, wet reflective ' +
      'surfaces, coloured neon spill, deep shadows, grainy 35mm film. The subject ' +
      'keeps its own colours and shape.',
  },
  {
    id: 'clay',
    label: 'CLAY',
    hint: 'stop-motion',
    prompt:
      'Remake this exact photograph as handmade claymation: every surface sculpted ' +
      'plasticine with fingerprints and tool marks, soft studio light. Keep the ' +
      'same framing, the same subject in the same position, the same background ' +
      'layout and the same colours. Only the material changes.',
  },
  {
    id: 'ink',
    label: 'INK',
    hint: 'brush and paper',
    prompt:
      'Redraw this exact photograph as bold black brush ink on rough paper: heavy ' +
      'strokes, large areas of pure black and bare paper, no colour. Keep the same ' +
      'framing, subject and composition so the drawing is recognisably this photo.',
  },
  {
    id: 'kaiju',
    label: 'KAIJU',
    hint: 'city-scale monster',
    prompt:
      'Keep the main object of this photograph exactly as it is — same shape, same ' +
      'colours, same markings — and keep the camera angle. Change only the scale ' +
      'and the surroundings: the object now towers over a small town at dusk, with ' +
      'tiny buildings, searchlights and smoke around its base.',
  },
  {
    id: 'poster',
    label: 'POSTER',
    hint: 'travel print',
    prompt:
      'Turn this exact photograph into a mid-century travel poster: flat vector ' +
      'shapes, a three-colour screen-print palette taken from the photo itself, ' +
      'visible paper grain. Keep the same framing, the same subject in the same ' +
      'position and the same background shapes.',
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

/**
 * Today's theme as a look of its own.
 *
 * FIVE PARTS, IN THIS ORDER, and every one of them earned its place against a
 * photo of a PC and the theme "your machine, transformed into a robot":
 *
 *   1. the theme FIRST, because whatever leads is what the model obeys;
 *   2. "apply this to the object in the photo", binding it to the subject;
 *   3. "rebuilt from its own panels, lights, cables", which is what keeps the
 *      thing recognisable — the PC's RGB strips came back as the robot's chest
 *      light bars;
 *   4. the room, surface and camera angle pinned, so it stays the same picture;
 *   5. "strong visible change", because without it the model does the minimum.
 *
 * The VERB carries more weight than any of the qualifiers. "It transforms and
 * reassembles into that" works; "it becomes that" does not, and the difference
 * is reproducible on the same photograph. Softening the verb while adding one
 * more reassurance ("so it stays recognisably the same thing", "same surface")
 * was enough to turn a robot back into a PC with its lights switched off.
 *
 * Two earlier versions failed in opposite directions. "The setting around it
 * changes to suit the theme" told it to change the ROOM, so a PC stayed a PC in
 * a slightly different room. "You may reshape the object, the surroundings, or
 * both — whatever the theme requires" was permissive enough that it simply
 * turned the RGB lighting off and called it done.
 *
 * Built rather than listed, because the theme changes daily and it is the whole
 * point of the arena: the entry should be YOUR photo bent toward the quest, not
 * a generic render of the words. So the instruction keeps the subject and the
 * framing and moves everything else.
 */
export function questStyle(theme: string): SnapStyle {
  return {
    id: 'quest',
    label: "TODAY'S QUEST",
    hint: theme,
    prompt:
      `${theme}. Apply this to the object in the photo: it transforms and ` +
      `reassembles into that, built from its own panels, lights and cables. ` +
      `Same room, same camera angle, same colours. Strong visible change.`,
  };
}

