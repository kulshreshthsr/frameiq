/**
 * Architecture placeholder for future occlusion support: if a wall photo
 * ever ships with an occlusion mask (WallImage.occlusionMaskSrc — a
 * black/white image where white marks real-wall pixels and black marks
 * foreground objects, e.g. furniture, standing in front of the wall), a
 * frame's Group would apply that mask via
 * `globalCompositeOperation: 'destination-out'` against the mask's alpha at
 * the frame's own screen position, clipping away whatever part of the frame
 * overlaps a foreground object instead of letting it render pasted on top.
 *
 * No mask exists yet and nothing calls into this file — it exists purely to
 * mark the intended seam so a future occlusion feature doesn't need to
 * first rediscover where in the render pipeline it belongs.
 */
export {}
