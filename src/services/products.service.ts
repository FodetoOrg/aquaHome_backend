//@ts-nocheck
import { eq, and } from 'drizzle-orm';
import { products } from '../models/schema';
import { notFound } from '../utils/errors';
import { generateId, parseJsonSafe } from '../utils/helpers';
import { getFastifyInstance } from '../shared/fastify-instance';
import { sql } from 'drizzle-orm';

// Get all products
export async function getAllProducts(includeInactive = false) {
    const fastify = getFastifyInstance()

    // let query = fastify.db.query.products;
    let results = await fastify.db.query.products.findMany({

    });

    console.log('results ', results)
    return results.map(result => { return { ...result, images: JSON.parse(result.images) } })
}

export async function getProductById(id: string) {
    const fastify = getFastifyInstance();

    const result = await fastify.db.query.products.findFirst({
        where: eq(products.id, id)
    });

    if (!result) return null;

    return {
        ...result,
        images: parseJsonSafe<string[]>(result.images, [])
    };
}


// Create product
export async function createProduct(data: {
    name: string;
    description: string;
    images: string[];
    rentPrice: number;
    buyPrice: number;
    deposit: number;
    isRentable?: boolean;
    categoryId: string;
    isPurchasable?: boolean;
    features?: { name: string; value: string; }[];
}) {
    const fastify = getFastifyInstance()

    const id =  await generateId('prod');


    console.log('came here ')
    await fastify.db.transaction(async (tx) => {
        const now = new Date().toISOString();

        await tx
            .insert(products)
            .values({
                id,
                name: data.name,
                description: data.description,
                images: JSON.stringify(data.images || []),
                rentPrice: data.rentPrice,
                buyPrice: data.buyPrice,
                deposit: data.deposit,
                isRentable: data.isRentable ?? true,
                isPurchasable: data.isPurchasable ?? true,
                createdAt: now,
                updatedAt: now,
                isActive: true,
                categoryId: data.categoryId
            })



    });
    return getProductById(id);
}

// Update product
export async function updateProduct(id: string, data: {
    name?: string;
    description?: string;
    images?: string[];
    rentPrice?: number;
    buyPrice?: number;
    deposit?: number;
    isRentable?: boolean;
    isPurchasable?: boolean;
    isActive?: boolean;
    existingImages: string[];
    categoryId:string;
}) {
    const fastify = getFastifyInstance();

    const product = await getProductById(id);
    if (!product) {
        throw notFound('Product');
    }

    const updateData: any = {
        updatedAt: new Date().toISOString()
    };



    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.images !== undefined) updateData.images = JSON.stringify([...data.images, ...data.existingImages]);
    if (data.rentPrice !== undefined) updateData.rentPrice = data.rentPrice;
    if (data.buyPrice !== undefined) updateData.buyPrice = data.buyPrice;
    if (data.deposit !== undefined) updateData.deposit = data.deposit;
    if (data.isRentable !== undefined) updateData.isRentable = data.isRentable;
    if (data.isPurchasable !== undefined) updateData.isPurchasable = data.isPurchasable;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;

    await fastify.db
        .update(products)
        .set(updateData)
        .where(eq(products.id, id));

    return getProductById(id);
}

// Delete product (soft delete)
export async function deleteProduct(id: string) {
    const fastify = getFastifyInstance();

    const product = await getProductById(id);
    if (!product) {
        throw notFound('Product');
    }

    // Soft delete by setting isActive to false
    await fastify.db
        .update(products)
        .set({
            isActive: false,
            updatedAt: new Date().toISOString(),
        })
        .where(eq(products.id, id));

    return { message: 'Product deleted successfully', id };
}

/**
 * Get comprehensive product details for admin including installation requests, subscriptions, and other related data
 * @param productId Product ID
 * @returns Comprehensive product details object
 */
export async function getAdminProductDetails(productId: string) {
    const fastify = getFastifyInstance();

    // Get basic product information
    const product = await getProductById(productId);
    if (!product) {
        return null;
    }

    // Get installation requests for this product
    const installationRequestsResult = await fastify.db.run(sql`
        SELECT 
            ir.id,
            ir.name,
            ir.customer_id as customerId,
            u.name as customerName,
            ir.order_type as orderType,
            ir.status,
            f.name as franchiseName,
            ir.franchise_id as franchiseId,
            ir.connect_id as connectId,
            ir.scheduled_date as scheduledDate,
            ir.completed_date as completedDate,
            ir.created_at as createdAt,
            ir.updated_at as updatedAt,
            ir.pay_amount as payAmount,
            ir.razorpay_payment_link as razorpayPaymentLink
        FROM installation_requests ir
        LEFT JOIN users u ON u.id = ir.customer_id
        LEFT JOIN franchises f ON f.id = ir.franchise_id
        WHERE ir.product_id = ${productId}
        ORDER BY ir.created_at DESC
    `);

    // Get subscriptions for this product
    const subscriptionsResult = await fastify.db.run(sql`
        SELECT 
            s.id,
            s.connect_id as connectId,
            s.customer_id as customerId,
            u.name as customerName,
            s.franchise_id as franchiseId,
            f.name as franchiseName,
            s.plan_name as planName,
            s.status,
            s.start_date as startDate,
            s.end_date as endDate,
            s.current_period_start_date as currentPeriodStartDate,
            s.current_period_end_date as currentPeriodEndDate,
            s.next_payment_date as nextPaymentDate,
            s.monthly_amount as monthlyAmount,
            s.deposit_amount as depositAmount,
            s.created_at as createdAt,
            s.updated_at as updatedAt
        FROM subscriptions s
        LEFT JOIN users u ON u.id = s.customer_id
        LEFT JOIN franchises f ON f.id = s.franchise_id
        WHERE s.product_id = ${productId}
        ORDER BY s.created_at DESC
    `);

    // Get service requests for this product
    const serviceRequestsResult = await fastify.db.run(sql`
        SELECT 
            sr.id,
            sr.type,
            sr.description,
            sr.status,
            sr.customer_id as customerId,
            u.name as customerName,
            sr.franchise_id as franchiseId,
            f.name as franchiseName,
            sr.assigned_to_id as assignedToId,
            sa.name as assignedToName,
            sr.scheduled_date as scheduledDate,
            sr.completed_date as completedDate,
            sr.require_payment as requirePayment,
            sr.created_at as createdAt,
            sr.updated_at as updatedAt
        FROM service_requests sr
        LEFT JOIN users u ON u.id = sr.customer_id
        LEFT JOIN franchises f ON f.id = sr.franchise_id
        LEFT JOIN users sa ON sa.id = sr.assigned_to_id
        WHERE sr.product_id = ${productId}
        ORDER BY sr.created_at DESC
    `);

    // Get payments related to this product
    const paymentsResult = await fastify.db.run(sql`
        SELECT 
            p.id,
            p.amount,
            p.type,
            p.status,
            p.payment_method as paymentMethod,
            p.razorpay_payment_id as razorpayPaymentId,
            p.created_at as createdAt
        FROM payments p
        WHERE p.subscription_id IN (
            SELECT id FROM subscriptions WHERE product_id = ${productId}
        ) OR p.service_request_id IN (
            SELECT id FROM service_requests WHERE product_id = ${productId}
        ) OR p.installation_request_id IN (
            SELECT id FROM installation_requests WHERE product_id = ${productId}
        )
        ORDER BY p.created_at DESC
    `);

    // Extract arrays from database results and ensure they are arrays
    const installationRequests = Array.isArray(installationRequestsResult) ? installationRequestsResult : [];
    const subscriptions = Array.isArray(subscriptionsResult) ? subscriptionsResult : [];
    const serviceRequests = Array.isArray(serviceRequestsResult) ? serviceRequestsResult : [];
    const payments = Array.isArray(paymentsResult) ? paymentsResult : [];

    // Calculate statistics
    const stats = {
        totalInstallationRequests: installationRequests.length,
        totalSubscriptions: subscriptions.length,
        totalServiceRequests: serviceRequests.length,
        totalPayments: payments.length,
        activeSubscriptions: subscriptions.filter((s: any) => s.status === 'ACTIVE').length,
        completedInstallations: installationRequests.filter((ir: any) => ir.status === 'INSTALLATION_COMPLETED').length,
        pendingInstallations: installationRequests.filter((ir: any) => ['SUBMITTED', 'FRANCHISE_CONTACTED', 'INSTALLATION_SCHEDULED'].includes(ir.status)).length,
        totalRevenue: payments.reduce((sum: number, p: any) => sum + (p.status === 'COMPLETED' ? p.amount : 0), 0),
    };

    // Create recent activity timeline
    const recentActivity = [];
    
    // Add installation requests
    installationRequests.forEach((ir: any) => {
        recentActivity.push({
            type: 'INSTALLATION_REQUEST',
            id: ir.id,
            description: `Installation request for ${ir.name}`,
            timestamp: ir.createdAt,
            status: ir.status,
        });
    });

    // Add subscriptions
    subscriptions.forEach((s: any) => {
        recentActivity.push({
            type: 'SUBSCRIPTION',
            id: s.id,
            description: `Subscription ${s.planName} created`,
            timestamp: s.createdAt,
            status: s.status,
        });
    });

    // Add service requests
    serviceRequests.forEach((sr: any) => {
        recentActivity.push({
            type: 'SERVICE_REQUEST',
            id: sr.id,
            description: `Service request: ${sr.type}`,
            timestamp: sr.createdAt,
            status: sr.status,
        });
    });

    // Sort by timestamp (most recent first)
    recentActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
        product,
        statistics: stats,
        installationRequests,
        subscriptions,
        serviceRequests,
        payments,
        recentActivity: recentActivity.slice(0, 20), // Limit to 20 most recent activities
    };
}



