-- One row per delivered order, Jan 2017 - Aug 2018.
-- Aggregate items and reviews first so the joins never duplicate orders.
CREATE OR REPLACE VIEW fct_orders AS
WITH items AS (
    SELECT order_id,
           sum(price)         AS gmv,
           sum(freight_value) AS freight
    FROM order_items
    GROUP BY order_id
),
reviews AS (
    -- some orders have several reviews: keep the most recent score
    SELECT order_id,
           arg_max(review_score, review_answer_timestamp) AS review_score
    FROM order_reviews
    GROUP BY order_id
)
SELECT o.order_id,
       c.customer_unique_id,
       c.customer_state,
       date_trunc('month', o.order_purchase_timestamp) AS month,
       date_diff('day', o.order_purchase_timestamp, o.order_delivered_carrier_date)      AS seller_handoff_days,
       date_diff('day', o.order_delivered_carrier_date, o.order_delivered_customer_date) AS carrier_transit_days,
       date_diff('day', o.order_estimated_delivery_date, o.order_delivered_customer_date) AS delay_days,
       i.gmv,
       i.freight,
       r.review_score
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
JOIN items i     ON i.order_id    = o.order_id
LEFT JOIN reviews r ON r.order_id = o.order_id
WHERE o.order_status = 'delivered'
  AND o.order_delivered_customer_date IS NOT NULL
  AND o.order_purchase_timestamp >= '2017-01-01'
  AND o.order_purchase_timestamp <  '2018-09-01';
