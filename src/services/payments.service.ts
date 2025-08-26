
//@ts-nocheck
import { getFastifyInstance } from '../shared/fastify-instance';
import { payments, users, franchises, subscriptions } from '../models/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { notFound, forbidden, badRequest } from '../utils/errors';
import { UserRole } from '../types';
import { sql } from 'drizzle-orm';
import { serviceRequests, installationRequests, products } from '../models/schema';

export interface Payment {
    id: string;
    userId: string;
    subscriptionId?: string;
    serviceRequestId?: string;
    amount: number;
    status: 'pending' | 'completed' | 'failed' | 'refunded';
    paymentMethod: string;
    razorpayPaymentId?: string;
    razorpayOrderId?: string;
    franchiseId: string;
    createdAt: string;
    updatedAt: string;
}


export async function getSubscriptionPayments(user, id) {

    const fastify = getFastifyInstance()

    const db = fastify.db

    console.log('came here in payments')

    const sub = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.id, id)
    })

    console.log('sub is ', sub)

    if (!sub) {
        throw badRequest('subscription not found')
    }

    if (sub.customerId !== user.userId) {
        throw badRequest('you dont have access')
    }

    const paymentsDb = await db.query.payments.findMany({
        where: eq(payments.subscriptionId, id),

    })
    return {
        payments: paymentsDb,
        subscriptionDetails: {
            id: sub.id,
            nextPaymentDate: sub.currentPeriodEndDate,

        }
    }


}
/**
 * Get payments based on user role
 */
export async function getPaymentsByRole(user: any) {
    const fastify = getFastifyInstance();
    const db = fastify.db;

    let paymentsQuery;

    switch (user.role) {
        case UserRole.ADMIN:
            // Admin can see all payments
            paymentsQuery = db.query.payments.findMany({
                with: {
                    user: {
                        columns: {
                            id: true,
                            name: true,
                            phone: true,
                        }
                    },
                    subscription: {
                        columns: {
                            id: true,
                            planName: true,
                        }
                    },
                    franchise: {
                        columns: {
                            id: true,
                            name: true,
                            city: true,
                        }
                    }
                }
            });
            break;

        case UserRole.FRANCHISE_OWNER:
            // Get franchise owner's franchise area
            const franchise = await db.query.franchises.findFirst({
                where: eq(franchises.ownerId, user.userId)
            });

            if (!franchise) {
                throw notFound('Franchise area not found for this owner');
            }

            // Franchise owner can only see payments from their franchise
            paymentsQuery = db.query.payments.findMany({
                where: eq(payments.franchiseId, franchise.id),
                with: {
                    user: {
                        columns: {
                            id: true,
                            name: true,
                            phone: true,
                        }
                    },
                    subscription: {
                        columns: {
                            id: true,
                            planName: true,
                        }
                    }
                }
            });
            break;

        case UserRole.CUSTOMER:
            // Customer can only see their own payments
            paymentsQuery = db.query.payments.findMany({
                where: eq(payments.userId, user.userId),
                with: {
                    subscription: {
                        columns: {
                            id: true,
                            planName: true,
                        }
                    },
                    franchise: {
                        columns: {
                            id: true,
                            name: true,
                            city: true,
                        }
                    }
                }
            });
            break;

        default:
            throw forbidden('Access denied');
    }

    const results = await paymentsQuery;
    return results;
}

/**
 * Get payment by ID with role-based access control
 */
export async function getPaymentById(paymentId: string, user: any) {
    const fastify = getFastifyInstance();
    const db = fastify.db;

    const payment = await db.query.payments.findFirst({
        where: eq(payments.id, paymentId),
        with: {
            user: {
                columns: {
                    id: true,
                    name: true,
                    phone: true,
                }
            },
            subscription: {
                columns: {
                    id: true,
                    planName: true,
                }
            },
            franchise: {
                columns: {
                    id: true,
                    name: true,
                    city: true,
                }
            }
        }
    });

    if (!payment) {
        throw notFound('Payment');
    }

    // Check access based on role
    switch (user.role) {
        case UserRole.ADMIN:
            // Admin can access any payment
            break;

        case UserRole.FRANCHISE_OWNER:
            // Check if payment belongs to franchise owner's franchise
            const franchise = await db.query.franchises.findFirst({
                where: eq(franchises.ownerId, user.userId)
            });

            if (!franchise || payment.franchiseId !== franchise.id) {
                throw forbidden('Access denied to this payment');
            }
            break;

        case UserRole.CUSTOMER:
            // Customer can only access their own payments
            if (payment.userId !== user.userId) {
                throw forbidden('Access denied to this payment');
            }
            break;

        default:
            throw forbidden('Access denied');
    }

    return payment;
}

/**
 * Get revenue list for admin with franchise and subscription details
 */
export async function getRevenueListForAdmin(filters?: {
  franchiseId?: string;
  subscriptionId?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}) {
    const fastify = getFastifyInstance();
    const db = fastify.db;

    try {
        // Build base query with proper JOINs
        const baseQuery = sql`
            SELECT 
                p.id,
                p.amount,
                p.type,
                p.status,
                p.payment_method,
                p.razorpay_payment_id,
                p.razorpay_order_id,
                p.razorpay_subscription_id,
                p.collected_by_agent_id,
                p.receipt_image,
                p.due_date,
                p.paid_date,
                p.created_at,
                p.updated_at,
                
                -- Customer details (from subscription, service request, or installation request)
                u.id as customer_id,
                u.name as customer_name,
                u.phone as customer_phone,
                u.city as customer_city,
                
                -- Subscription details
                s.id as subscription_id,
                s.plan_name,
                s.monthly_amount,
                s.deposit_amount,
                s.status as subscription_status,
                s.start_date,
                s.end_date,
                
                -- Franchise details
                f.id as franchise_id,
                f.name as franchise_name,
                f.city as franchise_city,
                f.fullname as franchise_owner_name,
                
                -- Service request details (if applicable)
                sr.id as service_request_id,
                sr.type as service_type,
                sr.description as service_description,
                sr.status as service_status,
                
                -- Installation request details (if applicable)
                ir.id as installation_request_id,
                ir.name as installation_name,
                ir.order_type,
                ir.status as installation_status,
                
                -- Agent details (who collected offline payment)
                agent.id as agent_id,
                agent.name as agent_name,
                agent.phone as agent_phone
                
            FROM ${payments} p
            LEFT JOIN ${subscriptions} s ON p.subscription_id = s.id
            LEFT JOIN ${serviceRequests} sr ON p.service_request_id = sr.id
            LEFT JOIN ${installationRequests} ir ON p.installation_request_id = ir.id
            LEFT JOIN ${users} u ON (
                CASE 
                    WHEN p.subscription_id IS NOT NULL THEN s.customer_id
                    WHEN p.service_request_id IS NOT NULL THEN sr.customer_id
                    WHEN p.installation_request_id IS NOT NULL THEN ir.customer_id
                    ELSE NULL
                END = u.id
            )
            LEFT JOIN ${franchises} f ON (
                CASE 
                    WHEN p.subscription_id IS NOT NULL THEN s.franchise_id
                    WHEN p.service_request_id IS NOT NULL THEN sr.franchise_id
                    WHEN p.installation_request_id IS NOT NULL THEN ir.franchise_id
                    ELSE NULL
                END = f.id
            )
            LEFT JOIN ${users} agent ON p.collected_by_agent_id = agent.id
        `;

        // Build WHERE clause
        let whereClause = sql`WHERE 1=1`;
        
        if (filters?.franchiseId) {
            whereClause = sql`${whereClause} AND f.id = ${filters.franchiseId}`;
        }

        if (filters?.subscriptionId) {
            whereClause = sql`${whereClause} AND p.subscription_id = ${filters.subscriptionId}`;
        }

        if (filters?.status) {
            whereClause = sql`${whereClause} AND p.status = ${filters.status}`;
        }

        if (filters?.fromDate && filters?.toDate) {
            whereClause = sql`${whereClause} AND p.created_at BETWEEN ${filters.fromDate} AND ${filters.toDate}`;
        }

        // Build ORDER BY and LIMIT
        let orderAndLimit = sql`ORDER BY p.created_at DESC`;
        
        if (filters?.limit) {
            orderAndLimit = sql`${orderAndLimit} LIMIT ${filters.limit}`;
        }

        if (filters?.offset) {
            orderAndLimit = sql`${orderAndLimit} OFFSET ${filters.offset}`;
        }

        // Execute main query
        const mainQuery = sql`${baseQuery} ${whereClause} ${orderAndLimit}`;
        const revenueData = await db.run(mainQuery).then(res => res.rows);

        // Get total count for pagination
        const countQuery = sql`${baseQuery} ${whereClause}`;
        const countResult = await db.run(sql`SELECT COUNT(*) as total FROM (${countQuery}) as subquery`).then(res => res.rows[0]);
        const totalCount = countResult?.total || 0;

        return {
            revenueList: revenueData.map(item => ({
                id: item.id,
                amount: item.amount,
                type: item.type,
                status: item.status,
                paymentMethod: item.payment_method,
                razorpayPaymentId: item.razorpay_payment_id,
                razorpayOrderId: item.razorpay_order_id,
                razorpaySubscriptionId: item.razorpay_subscription_id,
                collectedByAgentId: item.collected_by_agent_id,
                receiptImage: item.receipt_image,
                dueDate: item.due_date,
                paidDate: item.paid_date,
                createdAt: item.created_at,
                updatedAt: item.updated_at,
                
                customer: {
                    id: item.customer_id,
                    name: item.customer_name || 'N/A',
                    phone: item.customer_phone,
                    city: item.customer_city || 'N/A'
                },
                
                subscription: item.subscription_id ? {
                    id: item.subscription_id,
                    planName: item.plan_name || 'N/A',
                    monthlyAmount: Number(item.monthly_amount) || 0,
                    depositAmount: Number(item.deposit_amount) || 0,
                    status: item.subscription_status || 'N/A',
                    startDate: item.start_date || 'N/A',
                    endDate: item.end_date || 'N/A'
                } : null,
                
                franchise: {
                    id: item.franchise_id,
                    name: item.franchise_name || 'N/A',
                    city: item.franchise_city || 'N/A',
                    ownerName: item.franchise_owner_name || 'N/A'
                },
                
                serviceRequest: item.service_request_id ? {
                    id: item.service_request_id,
                    type: item.service_type || 'N/A',
                    description: item.service_description || 'N/A',
                    status: item.service_status || 'N/A'
                } : null,
                
                installationRequest: item.installation_request_id ? {
                    id: item.installation_request_id,
                    name: item.installation_name || 'N/A',
                    orderType: item.order_type || 'N/A',
                    status: item.installation_status || 'N/A'
                } : null,
                
                agent: item.agent_id ? {
                    id: item.agent_id,
                    name: item.agent_name || 'N/A',
                    phone: item.agent_phone || 'N/A'
                } : null
            })),
            totalCount: totalCount,
            pagination: {
                limit: filters?.limit || null,
                offset: filters?.offset || null,
                hasMore: filters?.limit ? (filters.offset || 0) + (filters.limit || 0) < totalCount : false
            }
        };

    } catch (error) {
        console.error('Error fetching revenue list for admin:', error);
        throw error;
    }
}

/**
 * Get detailed revenue information for a specific payment
 */
export async function getRevenueDetailsForAdmin(paymentId: string) {
    const fastify = getFastifyInstance();
    const db = fastify.db;

    try {
        const paymentDetails = await db.run(
            sql`
            SELECT 
                p.id,
                p.amount,
                p.type,
                p.status,
                p.payment_method,
                p.razorpay_payment_id,
                p.razorpay_order_id,
                p.razorpay_subscription_id,
                p.collected_by_agent_id,
                p.receipt_image,
                p.due_date,
                p.paid_date,
                p.created_at,
                p.updated_at,
                
                -- Customer details
                u.id as customer_id,
                u.name as customer_name,
                u.phone as customer_phone,
                u.city as customer_city,
                u.created_at as customer_joined_date,
                
                -- Subscription details
                s.id as subscription_id,
                s.plan_name,
                s.monthly_amount,
                s.deposit_amount,
                s.status as subscription_status,
                s.start_date,
                s.end_date,
                s.current_period_start_date,
                s.current_period_end_date,
                s.next_payment_date,
                
                -- Franchise details
                f.id as franchise_id,
                f.name as franchise_name,
                f.city as franchise_city,
                f.fullname as franchise_owner_name,
                f.phonenumber as franchise_owner_phone,
                
                -- Service request details (if applicable)
                sr.id as service_request_id,
                sr.type as service_type,
                sr.description as service_description,
                sr.status as service_status,
                sr.scheduled_date as service_scheduled_date,
                sr.completed_date as service_completed_date,
                
                -- Installation request details (if applicable)
                ir.id as installation_request_id,
                ir.name as installation_name,
                ir.order_type,
                ir.status as installation_status,
                ir.scheduled_date as installation_scheduled_date,
                ir.completed_date as installation_completed_date,
                ir.installation_address,
                
                -- Agent details (who collected offline payment)
                agent.id as agent_id,
                agent.name as agent_name,
                agent.phone as agent_phone,
                agent.role as agent_role,
                
                -- Product details (from subscription or installation)
                prod.id as product_id,
                prod.name as product_name,
                prod.description as product_description,
                prod.rent_price,
                prod.buy_price,
                prod.deposit
                
            FROM ${payments} p
            LEFT JOIN ${subscriptions} s ON p.subscription_id = s.id
            LEFT JOIN ${serviceRequests} sr ON p.service_request_id = sr.id
            LEFT JOIN ${installationRequests} ir ON p.installation_request_id = ir.id
            LEFT JOIN ${users} u ON (
                CASE 
                    WHEN p.subscription_id IS NOT NULL THEN s.customer_id
                    WHEN p.service_request_id IS NOT NULL THEN sr.customer_id
                    WHEN p.installation_request_id IS NOT NULL THEN ir.customer_id
                    ELSE NULL
                END = u.id
            )
            LEFT JOIN ${franchises} f ON (
                CASE 
                    WHEN p.subscription_id IS NOT NULL THEN s.franchise_id
                    WHEN p.service_request_id IS NOT NULL THEN sr.franchise_id
                    WHEN p.installation_request_id IS NOT NULL THEN ir.franchise_id
                    ELSE NULL
                END = f.id
            )
            LEFT JOIN ${users} agent ON p.collected_by_agent_id = agent.id
            LEFT JOIN ${products} prod ON (
                CASE 
                    WHEN p.subscription_id IS NOT NULL THEN s.product_id
                    WHEN p.installation_request_id IS NOT NULL THEN ir.product_id
                    ELSE NULL
                END = prod.id
            )
            WHERE p.id = ${paymentId}
            `
        ).then(res => res.rows[0]);

        if (!paymentDetails) {
            throw notFound('Payment');
        }

        return {
            id: paymentDetails.id,
            amount: paymentDetails.amount,
            type: paymentDetails.type,
            status: paymentDetails.status,
            paymentMethod: paymentDetails.payment_method,
            razorpayPaymentId: paymentDetails.razorpay_payment_id,
            razorpayOrderId: paymentDetails.razorpay_order_id,
            razorpaySubscriptionId: paymentDetails.razorpay_subscription_id,
            collectedByAgentId: paymentDetails.collected_by_agent_id,
            receiptImage: paymentDetails.receipt_image,
            dueDate: paymentDetails.due_date,
            paidDate: paymentDetails.paid_date,
            createdAt: paymentDetails.created_at,
            updatedAt: paymentDetails.updated_at,
            
            customer: {
                id: paymentDetails.customer_id,
                name: paymentDetails.customer_name || 'N/A',
                phone: paymentDetails.customer_phone,
                city: paymentDetails.customer_city || 'N/A',
                joinedDate: paymentDetails.customer_joined_date
            },
            
            subscription: paymentDetails.subscription_id ? {
                id: paymentDetails.subscription_id,
                planName: paymentDetails.plan_name || 'N/A',
                monthlyAmount: Number(paymentDetails.monthly_amount) || 0,
                depositAmount: Number(paymentDetails.deposit_amount) || 0,
                status: paymentDetails.subscription_status || 'N/A',
                startDate: paymentDetails.start_date || 'N/A',
                endDate: paymentDetails.end_date || 'N/A',
                currentPeriodStartDate: paymentDetails.current_period_start_date || 'N/A',
                currentPeriodEndDate: paymentDetails.current_period_end_date || 'N/A',
                nextPaymentDate: paymentDetails.next_payment_date || 'N/A'
            } : null,
            
            franchise: {
                id: paymentDetails.franchise_id,
                name: paymentDetails.franchise_name || 'N/A',
                city: paymentDetails.franchise_city || 'N/A',
                ownerName: paymentDetails.franchise_owner_name || 'N/A',
                ownerPhone: paymentDetails.franchise_owner_phone || 'N/A'
            },
            
            serviceRequest: paymentDetails.service_request_id ? {
                id: paymentDetails.service_request_id,
                type: paymentDetails.service_type || 'N/A',
                description: paymentDetails.service_description || 'N/A',
                status: paymentDetails.service_status || 'N/A',
                scheduledDate: paymentDetails.service_scheduled_date || 'N/A',
                completedDate: paymentDetails.service_completed_date || 'N/A'
            } : null,
            
            installationRequest: paymentDetails.installation_request_id ? {
                id: paymentDetails.installation_request_id,
                name: paymentDetails.installation_name || 'N/A',
                orderType: paymentDetails.order_type || 'N/A',
                status: paymentDetails.installation_status || 'N/A',
                scheduledDate: paymentDetails.installation_scheduled_date || 'N/A',
                completedDate: paymentDetails.installation_completed_date || 'N/A',
                address: paymentDetails.installation_address || 'N/A'
            } : null,
            
            agent: paymentDetails.agent_id ? {
                id: paymentDetails.agent_id,
                name: paymentDetails.agent_name || 'N/A',
                phone: paymentDetails.agent_phone || 'N/A',
                role: paymentDetails.agent_role || 'N/A'
            } : null,
            
            product: paymentDetails.product_id ? {
                id: paymentDetails.product_id,
                name: paymentDetails.product_name || 'N/A',
                description: paymentDetails.product_description || 'N/A',
                rentPrice: Number(paymentDetails.rent_price) || 0,
                buyPrice: Number(paymentDetails.buy_price) || 0,
                deposit: Number(paymentDetails.deposit) || 0
            } : null
        };

    } catch (error) {
        console.error('Error fetching revenue details for admin:', error);
        throw error;
    }
}
