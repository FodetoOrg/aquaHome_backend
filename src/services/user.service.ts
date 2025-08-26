//@ts-nocheck
import { eq, and, inArray } from "drizzle-orm";
import { franchises, installationRequests, subscriptions, User, users, serviceRequests, payments, products, franchiseAgents } from "../models/schema";
import { getFastifyInstance } from "../shared/fastify-instance";
import { notFound, forbidden } from "../utils/errors";
import { UserRole } from "../types";
import { sql } from "drizzle-orm";
import { count } from "drizzle-orm";

// Frontend interfaces
interface Payment {
  id: string;
  amount: number;
  status: 'COMPLETED' | 'PENDING' | 'FAILED';
  method: string;
  razorpayPaymentId?: string;
  paidDate?: string;
  dueDate: string;
}

interface Subscription {
  id: string;
  productId: string;
  productName: string;
  planType: 'MONTHLY' | 'YEARLY';
  status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
  startDate: string;
  endDate: string;
  amount: number;
  franchiseId: string;
  franchiseName: string;
  payments: Payment[];
}

interface InstallationRequest {
  id: string;
  productId: string;
  productName: string;
  status: string;
  requestedDate: string;
  scheduledDate?: string;
  completedDate?: string;
  franchiseId: string;
  franchiseName: string;
  assignedAgent?: {
    id: string;
    name: string;
    phone: string;
  };
}

interface ServiceRequest {
  id: string;
  type: string;
  description: string;
  status: string;
  priority: string;
  createdAt: string;
  completedDate?: string;
  franchiseId: string;
  franchiseName: string;
  assignedAgent?: {
    id: string;
    name: string;
    phone: string;
  };
}

interface CustomerDetails {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  subscriptions: Subscription[];
  installationRequests: InstallationRequest[];
  serviceRequests: ServiceRequest[];
}

export async function onboardUser(
    userId: string,
    onboardData: {
        name: string;
        city: string,
        alternativePhone?: string;
    }
): Promise<User> {
    const fastify = getFastifyInstance();

    const user = await getUserById(userId);
    if (!user) {
        throw notFound('User');
    }

    const updateData: any = {
        name: onboardData.name,
        hasOnboarded: true,
        updatedAt: new Date().toISOString(),
        alternativePhone: onboardData.alternativePhone,
        city: onboardData.city
    };

    if (onboardData.alternativePhone) updateData.alternativePhone = onboardData.alternativePhone;

    const [userUpdated] = await fastify.db
        .update(users)
        .set(updateData)
        .where(eq(users.id, userId)).returning();

    return userUpdated;
}

export async function getUserById(id: string): Promise<User | null> {
    const fastify = getFastifyInstance();

    const result = await fastify.db.query.users.findFirst({
        where: eq(users.id, id),
    });

    if (!result) {
        return null;
    }

    return result;
}

export async function updateUser(userId: string, updateData: Partial<User>) {
  const fastify = getFastifyInstance();

  await fastify.db.update(users).set({
    ...updateData,
    updatedAt: new Date().toISOString()
  }).where(eq(users.id, userId));

  return getUserById(userId);
}

export async function registerPushNotificationToken(userId: string, token: string) {
  const fastify = getFastifyInstance();

  // Get current user to check existing token
  const user = await getUserById(userId);
  if (!user) throw notFound('User');

  // Check if token is the same as existing
  if (user.pushNotificationToken === token) {
    return {
      message: 'Push notification token is already registered',
      updated: false
    };
  }

  // Update the token
  await fastify.db.update(users).set({
    pushNotificationToken: token,
    updatedAt: new Date().toISOString()
  }).where(eq(users.id, userId));

  return {
    message: 'Push notification token registered successfully',
    updated: true
  };
}

export async function getUserDetails(userId: string, requestingUser: any): Promise<CustomerDetails> {
  const fastify = getFastifyInstance();

  // Permission checks
  if (requestingUser.role === UserRole.CUSTOMER) {
    // Customers can only view their own details
    if (requestingUser.userId !== userId) {
      throw forbidden('You can only view your own details');
    }
  } else if (requestingUser.role === UserRole.FRANCHISE_OWNER) {
    // Franchise owners can view details of users in their franchise area
    const targetUser = await fastify.db.query.users.findFirst({
      where: eq(users.id, userId)
    });

    if (!targetUser) {
      throw notFound('User');
    }

    // Check if the user belongs to the franchise owner's area
    const franchiseAreas = await fastify.db.query.franchises.findMany({
      where: eq(franchises.ownerId, requestingUser.userId)
    });

    const franchiseAreaIds = franchiseAreas.map(area => area.id);

    // Check if user has any subscriptions or installation requests in franchise owner's areas
    const hasAccess = await fastify.db.transaction(async (tx) => {
      const userSubscriptions = await tx.query.subscriptions.findMany({
        where: and(
          eq(subscriptions.customerId, userId),
          inArray(subscriptions.franchiseId, franchiseAreaIds)
        )
      });

      const userInstallations = await tx.query.installationRequests.findMany({
        where: and(
          eq(installationRequests.customerId, userId),
          inArray(installationRequests.franchiseId, franchiseAreaIds)
        )
      });

      return userSubscriptions.length > 0 || userInstallations.length > 0;
    });

    if (!hasAccess) {
      throw forbidden('You can only view details of users in your franchise area');
    }
  } else if (requestingUser.role !== UserRole.ADMIN) {
    // Only admins, franchise owners, and customers are allowed
    throw forbidden('You do not have permission to view user details');
  }

  // If all checks pass, proceed to fetch and return user details
  const userDetails = await getUserById(userId);
  if (!userDetails) {
    throw notFound('User');
  }

  // Fetch subscriptions with related data
  const userSubscriptions = await fastify.db.query.subscriptions.findMany({
    where: eq(subscriptions.customerId, userId),
    with: {
      product: true,
      franchise: true,
      payments: {
        where: eq(payments.subscriptionId, subscriptions.id)
      }
    }
  });

  // Fetch installation requests with related data
  const userInstallations = await fastify.db.query.installationRequests.findMany({
    where: eq(installationRequests.customerId, userId),
    with: {
      product: true,
      franchise: true,
      assignedTechnician: true
    }
  });

  // Fetch service requests with related data
  const userServiceRequests = await fastify.db.query.serviceRequests.findMany({
    where: eq(serviceRequests.customerId, userId),
    with: {
      product: true,
      franchise: true,
      assignedAgent: true
    }
  });

  // Format subscriptions
  const formattedSubscriptions: Subscription[] = userSubscriptions.map(sub => ({
    id: sub.id,
    productId: sub.productId,
    productName: sub.product?.name || 'Unknown Product',
    planType: 'MONTHLY', // Assuming monthly, you might need to derive this from your data
    status: sub.status as 'ACTIVE' | 'INACTIVE' | 'EXPIRED',
    startDate: sub.startDate,
    endDate: sub.endDate || '',
    amount: sub.monthlyAmount,
    franchiseId: sub.franchiseId,
    franchiseName: sub.franchise?.name || 'Unknown Franchise',
    payments: (sub.payments || []).map(payment => ({
      id: payment.id,
      amount: payment.amount,
      status: payment.status as 'COMPLETED' | 'PENDING' | 'FAILED',
      method: payment.paymentMethod,
      razorpayPaymentId: payment.razorpayPaymentId || undefined,
      paidDate: payment.paidDate || undefined,
      dueDate: payment.dueDate || ''
    }))
  }));

  // Format installation requests
  const formattedInstallations: InstallationRequest[] = userInstallations.map(install => ({
    id: install.id,
    productId: install.productId,
    productName: install.product?.name || 'Unknown Product',
    status: install.status,
    requestedDate: install.createdAt,
    scheduledDate: install.scheduledDate || undefined,
    completedDate: install.completedDate || undefined,
    franchiseId: install.franchiseId,
    franchiseName: install.franchiseName,
    assignedAgent: install.assignedTechnician ? {
      id: install.assignedTechnician.id,
      name: install.assignedTechnician.name || 'Unknown',
      phone: install.assignedTechnician.phone
    } : undefined
  }));

  // Format service requests
  const formattedServiceRequests: ServiceRequest[] = userServiceRequests.map(service => ({
    id: service.id,
    type: service.type,
    description: service.description,
    status: service.status,
    priority: 'MEDIUM', // You might need to add priority field to your schema or derive it
    createdAt: service.createdAt,
    completedDate: service.completedDate || undefined,
    franchiseId: service.franchiseId,
    franchiseName: service.franchise?.name || 'Unknown Franchise',
    assignedAgent: service.assignedAgent ? {
      id: service.assignedAgent.id,
      name: service.assignedAgent.name || 'Unknown',
      phone: service.assignedAgent.phone
    } : undefined
  }));

  // Return formatted customer details
  return {
    id: userDetails.id,
    name: userDetails.name || '',
    phone: userDetails.phone,
    email: undefined, // Add email field to your user schema if needed
    role: userDetails.role,
    isActive: userDetails.isActive,
    createdAt: userDetails.createdAt,
    subscriptions: formattedSubscriptions,
    installationRequests: formattedInstallations,
    serviceRequests: formattedServiceRequests
  };
}

export async function getAllCustomersForAdmin(filters?: {
  search?: string;
  city?: string;
  status?: 'active' | 'inactive';
  limit?: number;
  offset?: number;
}) {
    const fastify = getFastifyInstance();
    const db = fastify.db;

    try {
        let whereConditions: any[] = [sql`u.role = 'customer'`];
        let searchCondition = sql``;
        let limitClause = sql``;
        let offsetClause = sql``;

        // Add search filter
        if (filters?.search) {
            searchCondition = sql`AND (u.name LIKE ${`%${filters.search}%`} OR u.phone LIKE ${`%${filters.search}%`})`;
        }

        // Add city filter
        if (filters?.city) {
            whereConditions.push(sql`u.city = ${filters.city}`);
        }

        // Add status filter
        if (filters?.status) {
            const isActive = filters.status === 'active';
            whereConditions.push(sql`u.is_active = ${isActive}`);
        }

        // Add pagination
        if (filters?.limit) {
            limitClause = sql`LIMIT ${filters.limit}`;
        }

        if (filters?.offset) {
            offsetClause = sql`OFFSET ${filters.offset}`;
        }

        // Build the main query
        let mainQuery = sql`
            SELECT 
                u.id,
                u.name,
                u.phone,
                u.city,
                u.created_at as joinedToPlatform,
                u.is_active as status,
                COALESCE(ir.install_request_count, 0) as totalInstallRequests,
                COALESCE(s.subscription_count, 0) as subscriptionsCount,
                COALESCE(sr.service_request_count, 0) as serviceRequestCount
            FROM ${users} u
            LEFT JOIN (
                SELECT 
                    customer_id,
                    COUNT(*) as install_request_count
                FROM ${installationRequests}
                GROUP BY customer_id
            ) ir ON u.id = ir.customer_id
            LEFT JOIN (
                SELECT 
                    customer_id,
                    COUNT(*) as subscription_count
                FROM ${subscriptions}
                GROUP BY customer_id
            ) s ON u.id = s.customer_id
            LEFT JOIN (
                SELECT 
                    customer_id,
                    COUNT(*) as service_request_count
                FROM ${serviceRequests}
                GROUP BY customer_id
            ) sr ON u.id = sr.customer_id
            WHERE ${whereConditions[0]}
        `;

        // Add additional where conditions
        for (let i = 1; i < whereConditions.length; i++) {
            mainQuery = sql`${mainQuery} AND ${whereConditions[i]}`;
        }

        // Add search condition
        if (searchCondition.sql) {
            mainQuery = sql`${mainQuery} ${searchCondition}`;
        }

        // Add order by and pagination
        mainQuery = sql`${mainQuery} ORDER BY u.created_at DESC ${limitClause} ${offsetClause}`;

        // Get all customers with their basic info and statistics
        const customers = await db.run(mainQuery).then(res => res.rows);

        // Build the count query
        let countQuery = sql`
            SELECT COUNT(*) as total
            FROM ${users} u
            WHERE ${whereConditions[0]}
        `;

        // Add additional where conditions to count query
        for (let i = 1; i < whereConditions.length; i++) {
            countQuery = sql`${countQuery} AND ${whereConditions[i]}`;
        }

        // Add search condition to count query
        if (searchCondition.sql) {
            countQuery = sql`${countQuery} ${searchCondition}`;
        }

        // Get total count for pagination
        const totalCountResult = await db.run(countQuery).then(res => res.rows[0]);

        const totalCount = totalCountResult?.total || 0;

        return {
            customers: customers.map(customer => ({
                id: customer.id,
                name: customer.name || 'N/A',
                phoneNumber: customer.phone,
                status: customer.status ? 'Active' : 'Inactive',
                totalInstallRequests: customer.totalInstallRequests,
                subscriptionsCount: customer.subscriptionsCount,
                serviceRequestCount: customer.serviceRequestCount,
                joinedToPlatform: customer.joinedToPlatform,
                city: customer.city || 'N/A'
            })),
            totalCount: totalCount,
            pagination: {
                limit: filters?.limit || null,
                offset: filters?.offset || null,
                hasMore: filters?.limit ? (filters.offset || 0) + (filters.limit || 0) < totalCount : false
            }
        };

    } catch (error) {
        console.error('Error fetching customers for admin:', error);
        throw error;
    }
}

export async function getProfileDetails(userId: string, userRole: string) {
    const fastify = getFastifyInstance();
    const db = fastify.db;

    // Get basic user information
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId)
    });

    if (!user) {
        throw notFound('User');
    }

    const baseUserData = {
        id: user.id,
        name: user.name,
        phone: user.phone,
        alternativePhone: user.alternativePhone,
        city: user.city,
        role: user.role,
        hasOnboarded: user.hasOnboarded,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
    };

    // Return different profile data based on role
    switch (userRole) {
        case UserRole.ADMIN:
            return {
                user: baseUserData,
                profile: await getAdminProfile(db)
            };

        case UserRole.FRANCHISE_OWNER:
            return {
                user: baseUserData,
                profile: await getFranchiseOwnerProfile(db, userId)
            };

        case UserRole.SERVICE_AGENT:
            return {
                user: baseUserData,
                profile: await getServiceAgentProfile(db, userId)
            };

        default:
            return {
                user: baseUserData,
                profile: {
                    type: 'CUSTOMER'
                }
            };
    }
}

async function getAdminProfile(db: any) {
    // Get admin statistics
    const [
        totalFranchises,
        totalAgents,
        totalCustomers,
        totalRevenue
    ] = await Promise.all([
        db.select({ count: count() })
        .from(franchises)
        .where(eq(franchises.isActive, true)),

        db.select({ count: count() })
        .from(users)
        .where(
            and(
                eq(users.role, 'SERVICE_AGENT'),
                eq(users.isActive, true)
            )
        ),

        db.select({ count: count() })
        .from(users)
        .where(
            and(
                eq(users.role, 'CUSTOMER'),
                eq(users.isActive, true)
            )
        ),

        db.select({ 
            revenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)` 
        })
        .from(payments)
        .where(eq(payments.status, 'COMPLETED'))
    ]);

    return {
        type: 'ADMIN',
        totalFranchises: totalFranchises[0]?.count || 0,
        totalAgents: totalAgents[0]?.count || 0,
        totalCustomers: totalCustomers[0]?.count || 0,
        totalRevenue: totalRevenue[0]?.revenue || 0,
        permissions: [
            'manage_franchises',
            'manage_agents',
            'view_all_data',
            'manage_products',
            'view_reports',
            'manage_users'
        ]
    };
}

async function getFranchiseOwnerProfile(db: any, userId: string) {
    // Get franchise information
    const franchise = await db.query.franchises.findFirst({
        where: eq(franchises.ownerId, userId)
    });

    if (!franchise) {
        throw new Error('Franchise not found for this owner');
    }

    // Get franchise statistics
    const [
        totalAgents,
        totalCustomers,
        totalRevenue
    ] = await Promise.all([
        db.select({ count: count() })
        .from(franchiseAgents)
        .where(
            and(
                eq(franchiseAgents.franchiseId, franchise.id),
                eq(franchiseAgents.isActive, true)
            )
        ),

        db.select({ count: sql<number>`COUNT(DISTINCT ${installationRequests.customerId})` })
        .from(installationRequests)
        .where(eq(installationRequests.franchiseId, franchise.id)),

        db.select({ 
            revenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)` 
        })
        .from(payments)
        .innerJoin(installationRequests, eq(payments.installationRequestId, installationRequests.id))
        .where(
            and(
                eq(payments.status, 'COMPLETED'),
                eq(installationRequests.franchiseId, franchise.id)
            )
        )
    ]);

    return {
        type: 'FRANCHISE_OWNER',
        franchise: {
            id: franchise.id,
            name: franchise.name,
            fullname: franchise.fullname,
            city: franchise.city,
            franchiseType: franchise.franchiseType,
            isActive: franchise.isActive,
            totalAgents: totalAgents[0]?.count || 0,
            totalCustomers: totalCustomers[0]?.count || 0,
            totalRevenue: totalRevenue[0]?.revenue || 0,
            createdAt: franchise.createdAt
        }
    };
}

async function getServiceAgentProfile(db: any, userId: string) {
    // Get franchise assignments
    const assignments = await db.select({
        franchiseId: franchiseAgents.franchiseId,
        franchiseName: franchises.name,
        franchiseCity: franchises.city,
        isPrimary: franchiseAgents.isPrimary,
        isActive: franchiseAgents.isActive,
        assignedDate: franchiseAgents.assignedDate
    })
    .from(franchiseAgents)
    .innerJoin(franchises, eq(franchiseAgents.franchiseId, franchises.id))
    .where(
        and(
            eq(franchiseAgents.agentId, userId),
            eq(franchiseAgents.isActive, true)
        )
    );

    // Get agent statistics
    const [
        totalRequests,
        completedRequests,
        pendingRequests
    ] = await Promise.all([
        db.select({ count: count() })
        .from(serviceRequests)
        .where(eq(serviceRequests.assignedToId, userId)),

        db.select({ count: count() })
        .from(serviceRequests)
        .where(
            and(
                eq(serviceRequests.assignedToId, userId),
                eq(serviceRequests.status, 'COMPLETED')
            )
        ),

        db.select({ count: count() })
        .from(serviceRequests)
        .where(
            and(
                eq(serviceRequests.assignedToId, userId),
                sql`${serviceRequests.status} NOT IN ('COMPLETED', 'CANCELLED')`
            )
        )
    ]);

    const total = totalRequests[0]?.count || 0;
    const completed = completedRequests[0]?.count || 0;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
        type: 'SERVICE_AGENT',
        assignments,
        statistics: {
            totalRequests: total,
            completedRequests: completed,
            pendingRequests: pendingRequests[0]?.count || 0,
            completionRate
        }
    };
}