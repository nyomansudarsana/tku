"""
PT Kopernik logo — white-background remover.

Usage:
  1. Save the original logo PNG (white background) to this folder as:
         kopernik-logo-original.png
  2. Run:  python make_transparent.py
  3. The output is:  kopernik-logo.png  (transparent background)

The script uses a flood-fill approach from the four corners so it only
removes the white *background*, not any white that might be inside
letterforms.
"""

from pathlib import Path
from PIL import Image
import sys

SRC  = Path(__file__).parent / 'kopernik-logo-original.png'
DEST = Path(__file__).parent / 'kopernik-logo.png'

# Threshold: how close to pure white a pixel must be to be erased
WHITE_THRESHOLD = 240


def flood_fill_alpha(img: Image.Image, threshold: int) -> Image.Image:
    """Remove white background by flood-filling from every corner pixel."""
    img = img.convert('RGBA')
    w, h = img.size
    pixels = img.load()

    # BFS from the four corner pixels outward
    from collections import deque
    visited = [[False] * h for _ in range(w)]
    queue = deque()

    def is_white(x, y):
        r, g, b, a = pixels[x, y]
        return r >= threshold and g >= threshold and b >= threshold

    for sx, sy in [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1)]:
        if is_white(sx, sy) and not visited[sx][sy]:
            queue.append((sx, sy))
            visited[sx][sy] = True

    while queue:
        x, y = queue.popleft()
        r, g, b, _ = pixels[x, y]
        pixels[x, y] = (r, g, b, 0)   # make transparent

        for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
            nx, ny = x+dx, y+dy
            if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny] and is_white(nx, ny):
                visited[nx][ny] = True
                queue.append((nx, ny))

    return img


def main():
    if not SRC.exists():
        print(f'ERROR: source file not found:\n  {SRC}')
        print()
        print('Steps:')
        print('  1. Save the original logo PNG (white background) as:')
        print(f'     {SRC}')
        print('  2. Re-run this script.')
        sys.exit(1)

    print(f'Reading  {SRC.name} ...')
    img = Image.open(SRC)
    print(f'  Size: {img.size[0]}×{img.size[1]} px, mode: {img.mode}')

    print('Removing white background ...')
    result = flood_fill_alpha(img, WHITE_THRESHOLD)

    result.save(DEST, 'PNG')
    print(f'Saved    {DEST.name}')
    print()
    print('Done! The app will automatically use the transparent PNG.')
    print('Refresh the browser to see the result.')


if __name__ == '__main__':
    main()
