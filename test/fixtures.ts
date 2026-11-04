/** ASCII STL of an axis-aligned cube with edge `s` mm; `drop` removes triangles to open the mesh. */
export function cubeStl(s = 10, drop = 0): ArrayBuffer {
  const v = [[0,0,0],[s,0,0],[s,s,0],[0,s,0],[0,0,s],[s,0,s],[s,s,s],[0,s,s]];
  const f = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]].slice(drop);
  const body = f.map((t) => `facet normal 0 0 0\nouter loop\n${t.map((i) => `vertex ${v[i].join(' ')}`).join('\n')}\nendloop\nendfacet`).join('\n');
  return new TextEncoder().encode(`solid cube\n${body}\nendsolid cube\n`).buffer as ArrayBuffer;
}
