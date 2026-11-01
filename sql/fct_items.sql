-- One row per order item, with seller and category.
-- Needed for seller-level scenarios (probation). Reuses fct_orders for the
-- order-level facts so both views filter the same orders.
CREATE OR REPLACE VIEW fct_items AS
SELECT oi.order_id,
       oi.order_item_id,
       oi.seller_id,
       s.seller_state,
       coalesce(t.product_category_name_english, 'unknown') AS category,
       oi.price,
       oi.freight_value,
       f.customer_state,
       f.month,
       f.seller_handoff_days,
       f.carrier_transit_days,
       f.delay_days,
       f.review_score
FROM order_items oi
JOIN fct_orders f ON f.order_id = oi.order_id
JOIN sellers s    ON s.seller_id = oi.seller_id
LEFT JOIN products p ON p.product_id = oi.product_id
LEFT JOIN category_translation t
       ON t.product_category_name = p.product_category_name;
