import json
import os
import traceback
from pathlib import Path
from datetime import datetime
import re


def safe_int(v):
    """Convert v to int safely. If v is numeric-like, return int, else 0."""
    try:
        return int(v)
    except Exception:
        try:
            return int(float(v))
        except Exception:
            return 0


def main():
    path = Path(__file__).parent.parent / "docs" / "ftf_items.json"
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error opening or parsing JSON at {path}: {e}")
        traceback.print_exc()
        return

    if not isinstance(data, dict) or 'items' not in data or not isinstance(data['items'], list):
        print("JSON does not contain an 'items' list.")
        return

    total_value = 0
    rarity_totals = {
        "legendary": 0,
        "epic": 0,
        "rare": 0,
        "common": 0
    }
    rarity_counts = {
        "legendary": 0,
        "epic": 0,
        "rare": 0,
        "common": 0
    }

    items = data['items']
    item_count = len(items)

    # collect printed output so we can append it to a history file
    output_lines = []

    def record(s=''):
        print(s)
        output_lines.append(str(s))

    record("Calculating total value:")
    record("-" * 60)

    for item in items:
        try:
            name = item.get('name', '<unknown>') if isinstance(item, dict) else '<invalid>'
            value = safe_int(item.get('value', 0) if isinstance(item, dict) else 0)
            rarity = (item.get('rarity', '') if isinstance(item, dict) else '').lower()
            if rarity not in rarity_totals:
                # treat unknown rarities as common
                rarity = 'common'

            total_value += value
            rarity_totals[rarity] += value
            rarity_counts[rarity] += 1

            record(f"{name:<30} {value:>4} fv ({rarity:<9}) (Total: {total_value} fv)")
        except Exception:
            print("Error processing item:", item)
            traceback.print_exc()

    seasonals_value = rarity_totals['epic'] + rarity_totals['rare'] + rarity_totals['common']

    record("\n" + "-" * 60)
    record(f"Breakdown by rarity:")
    record(f"Legendary items ({rarity_counts['legendary']}): {rarity_totals['legendary']} fv ({rarity_totals['legendary']/40:.1f} hv)")
    record(f"Epic items ({rarity_counts['epic']}): {rarity_totals['epic']} fv ({rarity_totals['epic']/40:.1f} hv)")
    record(f"Rare items ({rarity_counts['rare']}): {rarity_totals['rare']} fv ({rarity_totals['rare']/40:.1f} hv)")
    record(f"Common items ({rarity_counts['common']}): {rarity_totals['common']} fv ({rarity_totals['common']/40:.1f} hv)")
    record(f"Seasonals ({rarity_counts['epic'] + rarity_counts['rare'] + rarity_counts['common']}): {seasonals_value} fv ({seasonals_value/40:.1f} hv)")
    record("-" * 60)
    record(f"Total number of items: {item_count}")
    record(f"Final total: {total_value} fv ({total_value/40:.2f} hv)")

    # Append run to history file with timestamp and difference from last run
    history_path = Path(__file__).parent / '1x all history'

    def read_last_final(path):
        if not path.exists():
            return None
        last_val = None
        with path.open('r', encoding='utf-8') as hf:
            for line in reversed(hf.read().splitlines()):
                if line.startswith('Final total:'):
                    m = re.search(r'Final total:\s*([0-9]+)', line)
                    if m:
                        try:
                            last_val = int(m.group(1))
                        except Exception:
                            last_val = None
                    break
        return last_val

    prev_total = read_last_final(history_path)
    diff_text = ''
    if prev_total is None:
        diff_text = 'No previous run found.'
    else:
        diff = total_value - prev_total
        sign = '+' if diff >= 0 else '-'
        diff_text = f"Difference from last run: {sign}{abs(diff)} fv (previous: {prev_total} fv)"

    # write only the breakdown section of the run to history
    # find the 'Breakdown by rarity:' line and the 'Final total:' line
    breakdown_lines = []
    start = None
    for idx, ln in enumerate(output_lines):
        if ln.strip() == 'Breakdown by rarity:':
            start = idx
            break

    if start is not None:
        end = None
        for j in range(start, len(output_lines)):
            if output_lines[j].startswith('Final total:'):
                end = j
                break
        if end is None:
            end = len(output_lines) - 1
        breakdown_lines = output_lines[start:end + 1]
    else:
        # fallback to a short summary if breakdown not found
        breakdown_lines = [f"Final total: {total_value} fv ({total_value/40:.2f} hv)"]

    with history_path.open('a', encoding='utf-8') as hf:
        hf.write('=' * 60 + '\n')
        hf.write(f"Run at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        for ln in breakdown_lines:
            hf.write(ln + '\n')
        hf.write(diff_text + '\n')
        hf.write('\n')

    # script completes; exit automatically


if __name__ == '__main__':
    main()
