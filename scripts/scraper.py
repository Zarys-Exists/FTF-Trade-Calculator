#!/usr/bin/env python3
"""
FTF Values Scraper
Scrapes item values from ftf-values.com and updates ftf_items.json
"""

import requests
from bs4 import BeautifulSoup
import json
import logging
import time
from pathlib import Path
from datetime import datetime
from items_map import name_mapping

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class FTFScraper:
    def __init__(self):
        self.base_url = "https://www.ftf-values.com"
        self.rarity_pages = {
            "legendary": "https://legendaries.ftf-values.com",
            "epic": "https://epics.ftf-values.com",
            "rare": "https://rares.ftf-values.com",
            "common": "https://commons.ftf-values.com"
        }
        self.items_file = Path(__file__).parent.parent / "docs" / "ftf_items.json"


    def scrape_rarity_page(self, url, rarity):
        """Scrape items from a specific rarity page using HTML table selectors"""
        logger.info(f"Scraping {rarity} items from {url}")

        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()

            soup = BeautifulSoup(response.content, 'html.parser')
            
            import re

            items = []
            rank_counter = 1  # Fallback counter if rank extraction fails
            
            # Find all item tables - each table contains one item
            tables = soup.find_all('table')
            
            for table in tables:
                try:
                    # Try to extract rank from the immediate preceding text node
                    rank = None
                    
                    # Look at the parent element and find text nodes before this table
                    parent = table.parent
                    if parent:
                        children = list(parent.children)
                        table_idx = children.index(table)
                        
                        # Look backwards for rank number
                        for i in range(table_idx - 1, -1, -1):
                            child = children[i]
                            if isinstance(child, str):
                                # Check if this text contains a rank number
                                rank_match = re.search(r'#(\d+)', child)
                                if rank_match:
                                    rank = int(rank_match.group(1))
                                    break
                            elif hasattr(child, 'get_text'):
                                # Check HTML elements for text
                                text_content = child.get_text()
                                rank_match = re.search(r'#(\d+)', text_content)
                                if rank_match:
                                    rank = int(rank_match.group(1))
                                    break
                    
                    # Extract item name from <span class="notranslate">
                    name_span = table.find('span', class_='notranslate')
                    if not name_span:
                        continue
                    
                    item_name = name_span.get_text().strip()
                    
                    # Extract item data from table text
                    table_text = table.get_text()
                    
                    # Extract value
                    value = None
                    if 'Value:' in table_text:
                        value_line = [line for line in table_text.split('\n') if 'Value:' in line][0]
                        value_str = value_line.split('Value:')[1].strip().split('\n')[0]
                        # Remove non-numeric characters from value (like asterisks)
                        value_str = ''.join(c for c in value_str if c.isdigit())
                        try:
                            value = int(value_str)
                        except ValueError:
                            continue
                    
                    # Extract stability
                    stability = 'stable'  # default
                    if 'Stability:' in table_text:
                        stability_line = [line for line in table_text.split('\n') if 'Stability:' in line][0]
                        stability = stability_line.split('Stability:')[1].strip().split('\n')[0]
                    
                    # Extract demand
                    demand = 1  # default
                    if 'Demand:' in table_text:
                        demand_line = [line for line in table_text.split('\n') if 'Demand:' in line][0]
                        try:
                            demand = int(demand_line.split('Demand:')[1].strip().split('\n')[0])
                        except ValueError:
                            demand = 1
                    
                    if item_name and value is not None:
                        # Use full name from mapping if available, handling rarity-aware mappings
                        full_name = item_name
                        if item_name in name_mapping:
                            mapping = name_mapping[item_name]
                            # Check if mapping is rarity-aware (dict) or simple string
                            if isinstance(mapping, dict):
                                # Rarity-aware mapping - use the capitalized rarity as key
                                full_name = mapping.get(rarity.capitalize(), item_name)
                            else:
                                # Simple string mapping
                                full_name = mapping
                        else:
                            # If no mapping found, capitalize first letter of each word
                            full_name = ' '.join(word.capitalize() for word in item_name.split())
                        
                        # Use extracted rank or fallback counter
                        final_rank = rank if rank is not None else rank_counter
                        
                        item_dict = {
                            "name": full_name,
                            "value": value,
                            "rarity": rarity.capitalize(),
                            "demand": demand,
                            "stability": stability,
                            "rank": final_rank
                        }
                        
                        items.append(item_dict)
                        rank_info = f", Rank: {final_rank}"
                        logger.debug(f"Found item: {full_name} (raw: {item_name}) - Value: {value}, Demand: {demand}, Stability: {stability}{rank_info}")
                        
                        rank_counter += 1
                
                except Exception as e:
                    logger.debug(f"Error parsing table: {e}")
                    continue

            logger.info(f"Found {len(items)} {rarity} items")
            return items

        except Exception as e:
            logger.error(f"Error scraping {rarity} page: {e}")
            return []

    def scrape_all_rarities(self):
        """Scrape all rarity pages and combine results"""
        all_items = []

        for rarity, url in self.rarity_pages.items():
            items = self.scrape_rarity_page(url, rarity)
            all_items.extend(items)
            # Be nice to the server
            time.sleep(1)

        return all_items

    def normalize_item_names(self, items):
        """Apply name_mapping to normalize scraped item names with rarity awareness"""
        for item in items:
            original_name = item['name']
            item_rarity = item['rarity']
            
            # Try to find mapping by comparing with keys in name_mapping
            if original_name in name_mapping:
                mapping = name_mapping[original_name]
                # Check if mapping is rarity-aware (dict) or simple string
                if isinstance(mapping, dict):
                    # Rarity-aware mapping
                    item['name'] = mapping.get(item_rarity, original_name)
                else:
                    # Simple string mapping
                    item['name'] = mapping
            # If no mapping found, keep original name
        return items

    def update_items_file(self, scraped_items, existing_data):
        """
        Selectively update the ftf_items.json file.
        Only update 'value', 'demand', 'stability', and 'rank' fields if they differ.
        Add new items if they don't exist in JSON.
        Preserve JSON formatting and line structure.
        Sort items by rarity (Legendary → Epic → Rare → Common) then by rank.
        """
        logger.info("Starting selective update process")
        print("\n" + "=" * 80)
        print(f"Scraping Session: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 80)
        
        # Create a mapping of scraped items by (name, rarity) for quick lookup
        scraped_by_name_rarity = {(item['name'], item['rarity']): item for item in scraped_items}
        existing_items = existing_data.get('items', [])
        
        # Track changes
        updated_count = 0
        no_change_count = 0
        new_items_added = []
        missing_from_scrape = []
        
        # Process existing items
        for existing_item in existing_items:
            item_name = existing_item['name']
            item_rarity = existing_item['rarity']
            
            if (item_name, item_rarity) in scraped_by_name_rarity:
                scraped_item = scraped_by_name_rarity[(item_name, item_rarity)]
                changes = []
                
                # Check each field
                if existing_item.get('value') != scraped_item.get('value'):
                    old_val = existing_item.get('value')
                    new_val = scraped_item.get('value')
                    existing_item['value'] = new_val
                    changes.append(f"value: {old_val} -> {new_val}")
                
                if existing_item.get('demand') != scraped_item.get('demand'):
                    old_val = existing_item.get('demand')
                    new_val = scraped_item.get('demand')
                    existing_item['demand'] = new_val
                    changes.append(f"demand: {old_val} -> {new_val}")
                
                if existing_item.get('stability') != scraped_item.get('stability'):
                    old_val = existing_item.get('stability')
                    new_val = scraped_item.get('stability')
                    existing_item['stability'] = new_val
                    changes.append(f"stability: {old_val} -> {new_val}")
                
                # Handle rank updates
                if scraped_item.get('rank') is not None:
                    if existing_item.get('rank') != scraped_item.get('rank'):
                        old_val = existing_item.get('rank')
                        new_val = scraped_item.get('rank')
                        existing_item['rank'] = new_val
                        changes.append(f"rank: {old_val} -> {new_val}")
                        print(f"  RANK CHANGED: {item_name} - Rank: {old_val} -> {new_val}")
                    else:
                        # Ensure rank is set even if unchanged
                        if 'rank' not in existing_item:
                            existing_item['rank'] = scraped_item.get('rank')
                            print(f"  RANK ADDED: {item_name} - Rank: {scraped_item.get('rank')}")
                
                if changes:
                    updated_count += 1
                    print(f"UPDATED: {item_name}")
                    for change in changes:
                        print(f"  - {change}")
                else:
                    no_change_count += 1
                
                # Mark as processed
                del scraped_by_name_rarity[(item_name, item_rarity)]
            else:
                # Item exists in JSON but not in scraped data
                missing_from_scrape.append(item_name)
                print(f"NOT IN SCRAPE (UNCHANGED): {item_name}")
        
        # Add any remaining scraped items (new items)
        for (item_name, item_rarity), scraped_item in scraped_by_name_rarity.items():
            new_item = {
                "name": scraped_item['name'],
                "value": scraped_item['value'],
                "rarity": scraped_item['rarity'],
                "demand": scraped_item['demand'],
                "stability": scraped_item['stability']
            }
            # Add rank if available
            if scraped_item.get('rank') is not None:
                new_item['rank'] = scraped_item['rank']
            
            existing_items.append(new_item)
            new_items_added.append(item_name)
            rank_info = f", rank: {scraped_item.get('rank')}" if scraped_item.get('rank') else ""
            print(f"NEW ITEM ADDED: {item_name} (value: {scraped_item['value']}, demand: {scraped_item['demand']}, stability: {scraped_item['stability']}{rank_info})")
        
        # Sort items by rarity (Legendary → Epic → Rare → Common) then by rank
        rarity_order = {"Legendary": 1, "Epic": 2, "Rare": 3, "Common": 4}
        existing_items.sort(key=lambda x: (rarity_order.get(x['rarity'], 5), x.get('rank', 999)))
        
        # Write updated data back to file, preserving format
        self.write_json_single_line_format(existing_data)
        
        # Summary
        print("")
        print("=" * 80)
        print(f"SUMMARY:")
        print(f"  Items Updated: {updated_count}")
        print(f"  Items with No Changes: {no_change_count}")
        print(f"  New Items Added: {len(new_items_added)}")
        print(f"  Items Missing from Scrape (unchanged): {len(missing_from_scrape)}")
        print("=" * 80)
        
        logger.info(f"Updated: {updated_count}, No changes: {no_change_count}, New items: {len(new_items_added)}, Missing from scrape: {len(missing_from_scrape)}")

    def write_json_single_line_format(self, data):
        """Write JSON file with items on single lines (original format)"""
        output = '{\n    "items": [\n'
        items = data.get('items', [])
        
        for i, item in enumerate(items):
            output += '        ' + json.dumps(item, separators=(',', ': '), ensure_ascii=False)
            if i < len(items) - 1:
                output += ',\n'
            else:
                output += '\n'
        
        output += '    ]\n}\n'
        
        with open(self.items_file, 'w', encoding='utf-8') as f:
            f.write(output)
        
        logger.info(f"Updated {self.items_file} with selective changes")

    def run(self):
        """Main scraping function"""
        logger.info("Starting FTF values scraper")
        
        # Scrape all items
        scraped_items = self.scrape_all_rarities()
        
        if not scraped_items:
            logger.error("No items found, scraping may have failed")
            print("ERROR: No items scraped!")
            return
        
        # Name mapping is already handled in scrape_rarity_page
        logger.info(f"Scraped {len(scraped_items)} items total")
        
        # Load existing JSON data
        if self.items_file.exists():
            with open(self.items_file, 'r', encoding='utf-8') as f:
                existing_data = json.load(f)
        else:
            logger.warning(f"Items file not found: {self.items_file}")
            existing_data = {"items": []}
        
        # Selectively update items
        self.update_items_file(scraped_items, existing_data)
        
        logger.info("Scraping and update completed successfully")

if __name__ == "__main__":
    scraper = FTFScraper()
    scraper.run()