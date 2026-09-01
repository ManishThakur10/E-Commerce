#!/bin/bash

# Multi-Courier Platform - Database Viewer
# This script provides an easy way to view the MySQL database

# Colors for better readability
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Database credentials
DB_CONTAINER="courier-mysql"
DB_USER="courier_user"
DB_PASSWORD="courier_password"
DB_NAME="courier_db"

# Function to execute MySQL query
run_query() {
    docker exec $DB_CONTAINER mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME -e "$1" 2>/dev/null
}

# Function to execute MySQL query with table formatting
run_query_table() {
    docker exec $DB_CONTAINER mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME --table -e "$1" 2>/dev/null
}

# Check if container is running
if ! docker ps | grep -q $DB_CONTAINER; then
    echo -e "${YELLOW}Error: MySQL container is not running!${NC}"
    echo "Start it with: docker compose -p courier-assignment up -d"
    exit 1
fi

echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Multi-Courier Platform - Database Viewer            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Show all tables
echo -e "${BLUE}📋 TABLES IN DATABASE${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
run_query_table "SHOW TABLES;"
echo ""

# Show migrations
echo -e "${BLUE}📦 MIGRATIONS (Applied)${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
run_query_table "SELECT name, executed_at FROM migrations ORDER BY id;"
echo ""

# Count records
echo -e "${BLUE}📊 RECORD COUNTS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ORDERS_COUNT=$(run_query "SELECT COUNT(*) FROM orders;" | tail -1)
TRACKING_COUNT=$(run_query "SELECT COUNT(*) FROM tracking_history;" | tail -1)
BATCHES_COUNT=$(run_query "SELECT COUNT(*) FROM bulk_batches;" | tail -1)
echo "Orders:           $ORDERS_COUNT"
echo "Tracking History: $TRACKING_COUNT"
echo "Bulk Batches:     $BATCHES_COUNT"
echo ""

# Show all orders
echo -e "${BLUE}📦 ORDERS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$ORDERS_COUNT" -eq 0 ]; then
    echo "No orders found."
else
    run_query_table "SELECT order_id, courier_partner, courier_order_id, awb_number, status, created_at FROM orders ORDER BY created_at DESC LIMIT 20;"
fi
echo ""

# Show tracking history
echo -e "${BLUE}📍 TRACKING HISTORY${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$TRACKING_COUNT" -eq 0 ]; then
    echo "No tracking history found."
else
    run_query_table "SELECT order_id, status, status_description, location, created_at FROM tracking_history ORDER BY created_at DESC LIMIT 20;"
fi
echo ""

# Show bulk batches if any
if [ "$BATCHES_COUNT" -gt 0 ]; then
    echo -e "${BLUE}📊 BULK BATCHES${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    run_query_table "SELECT batch_id, total_orders, processed_orders, successful_orders, failed_orders, status, created_at FROM bulk_batches ORDER BY created_at DESC;"
    echo ""
fi

echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}💡 Tips:${NC}"
echo "  - Run this script anytime: ./view-database.sh"
echo "  - For interactive MySQL: docker exec -it courier-mysql mysql -u courier_user -pcourier_password courier_db"
echo "  - View specific order: ./view-database.sh <order_id>"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""

# If order ID is provided as argument, show detailed view
if [ ! -z "$1" ]; then
    ORDER_ID=$1
    echo -e "${BLUE}🔍 DETAILED VIEW FOR ORDER: $ORDER_ID${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Order details
    echo -e "${YELLOW}Order Details:${NC}"
    run_query_table "SELECT * FROM orders WHERE order_id = '$ORDER_ID';"
    echo ""
    
    # Tracking history
    echo -e "${YELLOW}Tracking History:${NC}"
    run_query_table "SELECT id, status, status_description, location, created_at FROM tracking_history WHERE order_id = '$ORDER_ID' ORDER BY created_at;"
    echo ""
fi
