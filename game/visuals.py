from __future__ import annotations

import math
from dataclasses import dataclass

from panda3d.core import Geom, GeomNode, GeomTriangles, GeomVertexData, GeomVertexFormat, GeomVertexWriter, LineSegs, NodePath

from game.config import GAME_CONFIG


@dataclass
class BallVisual:
    ball_id: str
    node: NodePath


def create_table_visual(loader, parent: NodePath) -> NodePath:
    del loader

    table_cfg = GAME_CONFIG.table
    root = parent.attachNewNode("table-root")

    cloth = _make_box(root, "cloth", table_cfg.width, table_cfg.length, 0.04)
    cloth.setColor(*table_cfg.cloth_color, 1)
    cloth.setPos(0, 0, 0.0)

    border = _make_box(
        root,
        "border",
        table_cfg.width + table_cfg.rail_thickness,
        table_cfg.length + table_cfg.rail_thickness,
        0.05,
    )
    border.setColor(*table_cfg.felt_border_color, 1)
    border.setPos(0, 0, -0.02)

    rail_height = table_cfg.ball_radius * 1.15
    rail_top = table_cfg.ball_radius * 1.6
    rail_thickness = table_cfg.rail_thickness

    _make_rail(
        root,
        "rail-east",
        rail_thickness,
        table_cfg.length,
        table_cfg.width / 2 + rail_thickness / 2,
        0,
        rail_top,
        rail_height,
        table_cfg.rail_color,
    )
    _make_rail(
        root,
        "rail-west",
        rail_thickness,
        table_cfg.length,
        -table_cfg.width / 2 - rail_thickness / 2,
        0,
        rail_top,
        rail_height,
        table_cfg.rail_color,
    )
    _make_rail(
        root,
        "rail-north",
        table_cfg.width,
        rail_thickness,
        0,
        table_cfg.length / 2 + rail_thickness / 2,
        rail_top,
        rail_height,
        table_cfg.rail_color,
    )
    _make_rail(
        root,
        "rail-south",
        table_cfg.width,
        rail_thickness,
        0,
        -table_cfg.length / 2 - rail_thickness / 2,
        rail_top,
        rail_height,
        table_cfg.rail_color,
    )

    return root


def _make_rail(
    parent: NodePath,
    name: str,
    scale_x: float,
    scale_y: float,
    pos_x: float,
    pos_y: float,
    pos_z: float,
    scale_z: float,
    color: tuple[float, float, float],
) -> NodePath:
    rail = _make_box(parent, name, scale_x, scale_y, scale_z)
    rail.setColor(*color, 1)
    rail.setPos(pos_x, pos_y, pos_z)
    return rail


def create_ball_visual(loader, parent: NodePath, radius: float, color: tuple[float, float, float], name: str) -> NodePath:
    del loader
    node = _make_sphere(parent, name, 0.5, 16, 12)
    node.reparentTo(parent)
    node.setName(name)
    node.setScale(radius)
    node.setColor(*color, 1)
    node.setPos(0, 0, radius)
    return node


def create_cue_visual(parent: NodePath) -> NodePath:
    lines = LineSegs("cue-stick")
    lines.setThickness(4.0)
    lines.setColor(0.83, 0.69, 0.47, 1.0)
    lines.moveTo(0, 0, 0)
    lines.drawTo(0, 1.18, 0)
    node = parent.attachNewNode(lines.create())
    node.setLightOff(1)
    return node


def create_prediction_visual(parent: NodePath) -> NodePath:
    lines = LineSegs("prediction")
    lines.setThickness(2.0)
    lines.setColor(1.0, 1.0, 1.0, 0.35)
    lines.moveTo(0, 0, 0)
    lines.drawTo(0, 0, 0)
    node = parent.attachNewNode(lines.create())
    node.hide()
    return node


def build_ball_visuals(loader, parent: NodePath, ball_specs: list[tuple[str, tuple[float, float, float]]], radius: float) -> dict[str, BallVisual]:
    del loader
    visuals: dict[str, BallVisual] = {}
    for ball_id, color in ball_specs:
        node = create_ball_visual(None, parent, radius, color, f"ball-{ball_id}")
        visuals[ball_id] = BallVisual(ball_id=ball_id, node=node)
    return visuals


def _make_box(parent: NodePath, name: str, scale_x: float, scale_y: float, scale_z: float) -> NodePath:
    format_ = GeomVertexFormat.getV3n3()
    vdata = GeomVertexData(name, format_, Geom.UHStatic)
    vertex = GeomVertexWriter(vdata, "vertex")
    normal = GeomVertexWriter(vdata, "normal")
    tris = GeomTriangles(Geom.UHStatic)

    faces = [
        ((0, 0, 1), [(-0.5, -0.5, 0.5), (0.5, -0.5, 0.5), (0.5, 0.5, 0.5), (-0.5, 0.5, 0.5)]),
        ((0, 0, -1), [(-0.5, 0.5, -0.5), (0.5, 0.5, -0.5), (0.5, -0.5, -0.5), (-0.5, -0.5, -0.5)]),
        ((0, 1, 0), [(-0.5, 0.5, -0.5), (-0.5, 0.5, 0.5), (0.5, 0.5, 0.5), (0.5, 0.5, -0.5)]),
        ((0, -1, 0), [(-0.5, -0.5, -0.5), (0.5, -0.5, -0.5), (0.5, -0.5, 0.5), (-0.5, -0.5, 0.5)]),
        ((1, 0, 0), [(0.5, -0.5, -0.5), (0.5, 0.5, -0.5), (0.5, 0.5, 0.5), (0.5, -0.5, 0.5)]),
        ((-1, 0, 0), [(-0.5, -0.5, -0.5), (-0.5, -0.5, 0.5), (-0.5, 0.5, 0.5), (-0.5, 0.5, -0.5)]),
    ]

    for face_index, (face_normal, vertices) in enumerate(faces):
        base_index = face_index * 4
        for vx, vy, vz in vertices:
            vertex.addData3f(vx * scale_x, vy * scale_y, vz * scale_z)
            normal.addData3f(*face_normal)
        tris.addVertices(base_index, base_index + 1, base_index + 2)
        tris.addVertices(base_index, base_index + 2, base_index + 3)

    geom = Geom(vdata)
    geom.addPrimitive(tris)
    node = NodePath(GeomNode(name))
    node.node().addGeom(geom)
    node.reparentTo(parent)
    return node


def _make_sphere(parent: NodePath, name: str, radius: float, rings: int, sectors: int) -> NodePath:
    format_ = GeomVertexFormat.getV3n3()
    vdata = GeomVertexData(name, format_, Geom.UHStatic)
    vertex = GeomVertexWriter(vdata, "vertex")
    normal = GeomVertexWriter(vdata, "normal")
    tris = GeomTriangles(Geom.UHStatic)

    for ring in range(rings + 1):
        theta = math.pi * ring / rings
        sin_theta = math.sin(theta)
        cos_theta = math.cos(theta)
        for sector in range(sectors + 1):
            phi = 2.0 * math.pi * sector / sectors
            sin_phi = math.sin(phi)
            cos_phi = math.cos(phi)
            x = cos_phi * sin_theta
            y = sin_phi * sin_theta
            z = cos_theta
            vertex.addData3f(x * radius, y * radius, z * radius)
            normal.addData3f(x, y, z)

    def index(r: int, s: int) -> int:
        return r * (sectors + 1) + s

    for ring in range(rings):
        for sector in range(sectors):
            i0 = index(ring, sector)
            i1 = index(ring + 1, sector)
            i2 = index(ring + 1, sector + 1)
            i3 = index(ring, sector + 1)
            tris.addVertices(i0, i1, i2)
            tris.addVertices(i0, i2, i3)

    geom = Geom(vdata)
    geom.addPrimitive(tris)
    node = NodePath(GeomNode(name))
    node.node().addGeom(geom)
    node.reparentTo(parent)
    return node
