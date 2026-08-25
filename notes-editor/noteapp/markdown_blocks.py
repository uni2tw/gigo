import re

INDENT_SIZE = 2

_HEADING_RE = re.compile(r'^(#{1,6})\s+(.*)$')
_QUOTE_RE = re.compile(r'^>\s?(.*)$')
_CHECKLIST_RE = re.compile(r'^( *)[-*]\s+\[([ xX])\]\s+(.*)$')
_ORDERED_RE = re.compile(r'^( *)(\d+)\.\s+(.*)$')
_LIST_RE = re.compile(r'^( *)([-*])\s+(.*)$')
_TABLE_ROW_RE = re.compile(r'^\s*\|.*\|\s*$')
_TABLE_SEP_CELL_RE = re.compile(r'^:?-+:?$')


def _split_table_row(line):
    stripped = line.strip()
    if stripped.startswith('|'):
        stripped = stripped[1:]
    if stripped.endswith('|'):
        stripped = stripped[:-1]
    return [cell.strip() for cell in stripped.split('|')]


def _is_table_separator_row(line):
    if not _TABLE_ROW_RE.match(line):
        return False
    cells = _split_table_row(line)
    return bool(cells) and all(_TABLE_SEP_CELL_RE.match(c) for c in cells)


def _parse_table_align(sep_cells):
    align = []
    for cell in sep_cells:
        left = cell.startswith(':')
        right = cell.endswith(':')
        if left and right:
            align.append('center')
        elif right:
            align.append('right')
        elif left:
            align.append('left')
        else:
            align.append(None)
    return align


class Block(object):
    """A single outline block: a heading, quote, list item (bullet / ordered /
    checklist), table, or a plain paragraph.

    Only `list_item`, `ordered_item`, and `checklist_item` blocks may have
    children (nested outline levels); the tree serializes to/from a subset
    of Markdown (headings, block quotes, nested lists, tables, and plain
    paragraph lines).
    """

    __slots__ = ('type', 'text', 'level', 'children', 'checked', 'rows', 'align')

    def __init__(self, type_='paragraph', text='', level=0, children=None, checked=False,
                 rows=None, align=None):
        self.type = type_
        self.text = text
        self.level = level
        self.children = children if children is not None else []
        self.checked = checked
        self.rows = rows if rows is not None else []
        self.align = align if align is not None else []

    def to_dict(self):
        return {
            'type': self.type,
            'text': self.text,
            'level': self.level,
            'children': [c.to_dict() for c in self.children],
            'checked': self.checked,
            'rows': self.rows,
            'align': self.align,
        }

    @staticmethod
    def from_dict(d):
        block = Block(
            type_=d.get('type', 'paragraph'),
            text=d.get('text', ''),
            level=d.get('level', 0) or 0,
            checked=bool(d.get('checked', False)),
            rows=d.get('rows') or [],
            align=d.get('align') or [],
        )
        block.children = [Block.from_dict(c) for c in d.get('children', [])]
        return block


def parse_markdown_to_blocks(text):
    """Parse Markdown text into a forest of top-level Block objects."""
    blocks = []
    list_stack = []  # list of (depth, block) for the current nesting chain

    lines = text.splitlines()
    i = 0
    n = len(lines)
    while i < n:
        raw_line = lines[i]

        if raw_line.strip() == '':
            list_stack = []
            i += 1
            continue

        if _TABLE_ROW_RE.match(raw_line) and i + 1 < n and _is_table_separator_row(lines[i + 1]):
            rows = [_split_table_row(raw_line)]
            align = _parse_table_align(_split_table_row(lines[i + 1]))
            i += 2
            while i < n and lines[i].strip() != '' and _TABLE_ROW_RE.match(lines[i]):
                rows.append(_split_table_row(lines[i]))
                i += 1
            blocks.append(Block('table', rows=rows, align=align))
            list_stack = []
            continue

        heading_match = _HEADING_RE.match(raw_line)
        if heading_match:
            level = len(heading_match.group(1))
            blocks.append(Block('heading', heading_match.group(2).strip(), level))
            list_stack = []
            i += 1
            continue

        quote_match = _QUOTE_RE.match(raw_line)
        if quote_match:
            blocks.append(Block('quote', quote_match.group(1).strip()))
            list_stack = []
            i += 1
            continue

        checklist_match = _CHECKLIST_RE.match(raw_line)
        ordered_match = None if checklist_match else _ORDERED_RE.match(raw_line)
        bullet_match = None if (checklist_match or ordered_match) else _LIST_RE.match(raw_line)

        if checklist_match or ordered_match or bullet_match:
            if checklist_match:
                indent = len(checklist_match.group(1))
                new_block = Block('checklist_item', checklist_match.group(3).strip(),
                                   checked=checklist_match.group(2).lower() == 'x')
            elif ordered_match:
                indent = len(ordered_match.group(1))
                new_block = Block('ordered_item', ordered_match.group(3).strip())
            else:
                indent = len(bullet_match.group(1))
                new_block = Block('list_item', bullet_match.group(3).strip())

            depth = indent // INDENT_SIZE
            list_stack = [item for item in list_stack if item[0] < depth]
            if not list_stack:
                blocks.append(new_block)
            else:
                list_stack[-1][1].children.append(new_block)
            list_stack.append((depth, new_block))
            i += 1
            continue

        blocks.append(Block('paragraph', raw_line.strip()))
        list_stack = []
        i += 1

    return blocks


def _format_table_row(cells):
    return '| ' + ' | '.join(cells) + ' |'


def _format_table_separator(align, col_count):
    parts = []
    for i in range(col_count):
        a = align[i] if i < len(align) else None
        if a == 'center':
            parts.append(':---:')
        elif a == 'right':
            parts.append('---:')
        elif a == 'left':
            parts.append(':---')
        else:
            parts.append('---')
    return _format_table_row(parts)


def blocks_to_markdown(blocks):
    """Serialize a forest of Block objects back into Markdown text."""
    lines = []

    def emit(block_list, depth):
        ordered_counter = 0
        for block in block_list:
            if block.type == 'ordered_item':
                ordered_counter += 1
            else:
                ordered_counter = 0

            if block.type == 'heading':
                level = max(1, min(6, block.level or 1))
                lines.append('#' * level + ' ' + block.text)
            elif block.type == 'quote':
                lines.append('> ' + block.text)
            elif block.type == 'ordered_item':
                lines.append((' ' * (depth * INDENT_SIZE)) + '%d. ' % ordered_counter + block.text)
            elif block.type == 'checklist_item':
                mark = 'x' if block.checked else ' '
                lines.append((' ' * (depth * INDENT_SIZE)) + '- [%s] ' % mark + block.text)
            elif block.type == 'list_item':
                lines.append((' ' * (depth * INDENT_SIZE)) + '- ' + block.text)
            elif block.type == 'table':
                rows = block.rows or [['']]
                col_count = max(len(r) for r in rows)
                header = rows[0] + [''] * (col_count - len(rows[0]))
                lines.append(_format_table_row(header))
                lines.append(_format_table_separator(block.align or [], col_count))
                for row in rows[1:]:
                    lines.append(_format_table_row(row + [''] * (col_count - len(row))))
            else:
                lines.append(block.text)

            if block.children:
                emit(block.children, depth + 1)

    emit(blocks, 0)
    return '\n'.join(lines) + ('\n' if lines else '')
