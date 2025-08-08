import { cancelSubscriptionRequests, franchises, installationRequests, payments, products, serviceRequests, subscriptions, users } from '../models/schema';
import { UserRole, RentalStatus, InstallationRequestStatus, ServiceRequestStatus } from '../types';
import { sql, count, sum, eq, and, gte, lte, desc } from 'drizzle-orm';
import { getFastifyInstance } from '../shared/fastify-instance';
import { notFound } from '../utils/errors';

interface DateFilter {
    from?: string;
    to?: string;
}

export async function dashboardDataService(user: any, dateFilter?: DateFilter) {
    if (!user) {
        throw notFound('user');
    }

    const db = getFastifyInstance().db;
    let result;

    // Validate and parse date filters
    const { fromDate, toDate } = parseDateFilter(dateFilter);

    if (user.role === UserRole.ADMIN) {
        result = await getAdminDashboardData(db, fromDate, toDate);
    } else if (user.role === UserRole.FRANCHISE_OWNER) {
        result = await getFranchiseDashboardData(db, user.userId, fromDate, toDate);
    } else if (user.role === UserRole.SERVICE_AGENT) {
        result = await getServiceAgentDashboardData(db, user.userId, fromDate, toDate);
    }

    return result;
}

function parseDateFilter(dateFilter?: DateFilter) {
    const currentDate = new Date();
    let fromDate: string;
    let toDate: string;

    if (dateFilter?.from && dateFilter?.to) {
        // Validate date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(dateFilter.from) || !dateRegex.test(dateFilter.to)) {
            throw new Error('Invalid date format. Use YYYY-MM-DD');
        }

        fromDate = `${dateFilter.from} 00:00:00`;
        toDate = `${dateFilter.to} 23:59:59`;

        // Validate that from date is not after to date
        if (new Date(dateFilter.from) > new Date(dateFilter.to)) {
            throw new Error('From date cannot be after to date');
        }
    } else {
        // Default to last 30 days if no filter provided
        const thirtyDaysAgo = new Date(currentDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        fromDate = thirtyDaysAgo.toISOString();
        toDate = currentDate.toISOString();
    }

    return { fromDate, toDate };
}

function createDateCondition(dateColumn: any, fromDate: string, toDate: string) {
    return and(
        gte(dateColumn, fromDate),
        lte(dateColumn, toDate)
    );
}

async function getAdminDashboardData(db: any, fromDate: string, toDate: string) {
    // Calculate comparison period (same duration before the current period)
    const periodDuration = new Date(toDate).getTime() - new Date(fromDate).getTime();
    const comparisonFromDate = new Date(new Date(fromDate).getTime() - periodDuration).toISOString();
    const comparisonToDate = fromDate;

    // Stats queries with date filtering
    const [
        totalRevenue,
        previousRevenue,
        totalFranchises,
        totalInstallationRequests,
        previousInstallationRequests,
        cancelledInstallationRequests,
        completedInstallationRequests,
        totalServiceRequests,
        previousServiceRequests,
        cancelledServiceRequests,
        completedServiceRequests,
        totalCustomers,
        previousCustomers,
        totalServiceAgents,
        totalSubscriptions,
        previousSubscriptions,
        activeSubscriptions,
        cancelSubscriptionRequestsActive
    ] = await Promise.all([
        // Current period revenue
        db.select({ 
            revenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)` 
        })
        .from(payments)
        .where(
            and(
                eq(payments.status, 'COMPLETED'),
                createDateCondition(payments.paidDate, fromDate, toDate)
            )
        ),

        // Previous period revenue for comparison
        db.select({ 
            revenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)` 
        })
        .from(payments)
        .where(
            and(
                eq(payments.status, 'COMPLETED'),
                createDateCondition(payments.paidDate, comparisonFromDate, comparisonToDate)
            )
        ),

        // Total franchises (not time-filtered as it's cumulative)
        db.select({ count: count() })
        .from(franchises)
        .where(createDateCondition(franchises.createdAt, fromDate, toDate)),

        // Current period installation requests
        db.select({ count: count() })
        .from(installationRequests)
        .where(createDateCondition(installationRequests.createdAt, fromDate, toDate)),

        // Previous period installation requests
        db.select({ count: count() })
        .from(installationRequests)
        .where(createDateCondition(installationRequests.createdAt, comparisonFromDate, comparisonToDate)),

        // Installation requests by status (current period)
        db.select({ count: count() })
        .from(installationRequests)
        .where(
            and(
                eq(installationRequests.status, InstallationRequestStatus.CANCELLED),
                createDateCondition(installationRequests.createdAt, fromDate, toDate)
            )
        ),
        db.select({ count: count() })
        .from(installationRequests)
        .where(
            and(
                eq(installationRequests.status, InstallationRequestStatus.INSTALLATION_COMPLETED),
                createDateCondition(installationRequests.createdAt, fromDate, toDate)
            )
        ),

        // Current period service requests
        db.select({ count: count() })
        .from(serviceRequests)
        .where(createDateCondition(serviceRequests.createdAt, fromDate, toDate)),

        // Previous period service requests
        db.select({ count: count() })
        .from(serviceRequests)
        .where(createDateCondition(serviceRequests.createdAt, comparisonFromDate, comparisonToDate)),

        // Service requests by status (current period)
        db.select({ count: count() })
        .from(serviceRequests)
        .where(
            and(
                eq(serviceRequests.status, ServiceRequestStatus.CANCELLED),
                createDateCondition(serviceRequests.createdAt, fromDate, toDate)
            )
        ),
        db.select({ count: count() })
        .from(serviceRequests)
        .where(
            and(
                eq(serviceRequests.status, ServiceRequestStatus.COMPLETED),
                createDateCondition(serviceRequests.createdAt, fromDate, toDate)
            )
        ),

        // Current period customers
        db.select({ count: count() })
        .from(users)
        .where(
            and(
                eq(users.role, UserRole.CUSTOMER),
                createDateCondition(users.createdAt, fromDate, toDate)
            )
        ),

        // Previous period customers
        db.select({ count: count() })
        .from(users)
        .where(
            and(
                eq(users.role, UserRole.CUSTOMER),
                createDateCondition(users.createdAt, comparisonFromDate, comparisonToDate)
            )
        ),

        // Service agents (current period)
        db.select({ count: count() })
        .from(users)
        .where(
            and(
                eq(users.role, UserRole.SERVICE_AGENT),
                createDateCondition(users.createdAt, fromDate, toDate)
            )
        ),

        // Current period subscriptions
        db.select({ count: count() })
        .from(subscriptions)
        .where(createDateCondition(subscriptions.createdAt, fromDate, toDate)),

        // Previous period subscriptions
        db.select({ count: count() })
        .from(subscriptions)
        .where(createDateCondition(subscriptions.createdAt, comparisonFromDate, comparisonToDate)),

        // Active subscriptions (current state, not time-filtered)
        db.select({ count: count() })
        .from(subscriptions)
        .where(eq(subscriptions.status, RentalStatus.ACTIVE)),

        // Cancel subscription requests (current period)
        db.select({ count: count() })
        .from(cancelSubscriptionRequests)
        .where(createDateCondition(cancelSubscriptionRequests.createdAt, fromDate, toDate))
    ]);

    // Pie chart data queries (filtered by date)
    const [
        usersPieData,
        installationStatusPieData,
        serviceRequestsPieData,
        subscriptionStatusPieData
    ] = await Promise.all([
        // Users by role (new users in the period)
        db.select({
            role: users.role,
            count: count()
        })
        .from(users)
        .where(createDateCondition(users.createdAt, fromDate, toDate))
        .groupBy(users.role),

        // Installation requests by status (created in the period)
        db.select({
            status: installationRequests.status,
            count: count()
        })
        .from(installationRequests)
        .where(createDateCondition(installationRequests.createdAt, fromDate, toDate))
        .groupBy(installationRequests.status),

        // Service requests by status (created in the period)
        db.select({
            status: serviceRequests.status,
            count: count()
        })
        .from(serviceRequests)
        .where(createDateCondition(serviceRequests.createdAt, fromDate, toDate))
        .groupBy(serviceRequests.status),

        // Subscriptions by status (created in the period)
        db.select({
            status: subscriptions.status,
            count: count()
        })
        .from(subscriptions)
        .where(createDateCondition(subscriptions.createdAt, fromDate, toDate))
        .groupBy(subscriptions.status)
    ]);

    // Daily time series data for the filtered period
    const timeSeriesData = await Promise.all([
        // Daily new customers
        db.select({
            date: sql<string>`DATE(${users.createdAt})`,
            count: count()
        })
        .from(users)
        .where(
            and(
                eq(users.role, UserRole.CUSTOMER),
                createDateCondition(users.createdAt, fromDate, toDate)
            )
        )
        .groupBy(sql`DATE(${users.createdAt})`)
        .orderBy(sql`DATE(${users.createdAt})`),

        // Daily installation requests
        db.select({
            date: sql<string>`DATE(${installationRequests.createdAt})`,
            count: count()
        })
        .from(installationRequests)
        .where(createDateCondition(installationRequests.createdAt, fromDate, toDate))
        .groupBy(sql`DATE(${installationRequests.createdAt})`)
        .orderBy(sql`DATE(${installationRequests.createdAt})`),

        // Daily subscriptions
        db.select({
            date: sql<string>`DATE(${subscriptions.createdAt})`,
            count: count()
        })
        .from(subscriptions)
        .where(createDateCondition(subscriptions.createdAt, fromDate, toDate))
        .groupBy(sql`DATE(${subscriptions.createdAt})`)
        .orderBy(sql`DATE(${subscriptions.createdAt})`),

        // Daily revenue
        db.select({
            date: sql<string>`DATE(${payments.paidDate})`,
            revenue: sql<number>`SUM(${payments.amount})`
        })
        .from(payments)
        .where(
            and(
                eq(payments.status, 'COMPLETED'),
                createDateCondition(payments.paidDate, fromDate, toDate)
            )
        )
        .groupBy(sql`DATE(${payments.paidDate})`)
        .orderBy(sql`DATE(${payments.paidDate})`)
    ]);

    // Calculate percentage changes
    const calculatePercentageChange = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? 0 : 0;
        return ((current - previous) / previous) * 100;
    };

    return {
        dateFilter: { from: fromDate.split(' ')[0], to: toDate.split(' ')[0] },
        stats: {
            revenue: totalRevenue[0]?.revenue || 0,
            revenueChange: calculatePercentageChange(
                totalRevenue[0]?.revenue || 0,
                previousRevenue[0]?.revenue || 0
            ),
            totalFranchises: totalFranchises[0]?.count || 0,
            totalInstallationRequests: totalInstallationRequests[0]?.count || 0,
            installationRequestsChange: calculatePercentageChange(
                totalInstallationRequests[0]?.count || 0,
                previousInstallationRequests[0]?.count || 0
            ),
            cancelledInstallationRequests: cancelledInstallationRequests[0]?.count || 0,
            completedInstallationRequests: completedInstallationRequests[0]?.count || 0,
            totalServiceRequests: totalServiceRequests[0]?.count || 0,
            serviceRequestsChange: calculatePercentageChange(
                totalServiceRequests[0]?.count || 0,
                previousServiceRequests[0]?.count || 0
            ),
            cancelledServiceRequests: cancelledServiceRequests[0]?.count || 0,
            completedServiceRequests: completedServiceRequests[0]?.count || 0,
            totalCustomers: totalCustomers[0]?.count || 0,
            customersChange: calculatePercentageChange(
                totalCustomers[0]?.count || 0,
                previousCustomers[0]?.count || 0
            ),
            totalServiceAgents: totalServiceAgents[0]?.count || 0,
            totalSubscriptions: totalSubscriptions[0]?.count || 0,
            subscriptionsChange: calculatePercentageChange(
                totalSubscriptions[0]?.count || 0,
                previousSubscriptions[0]?.count || 0
            ),
            activeSubscriptions: activeSubscriptions[0]?.count || 0,
            cancelSubscriptionRequestsActive: cancelSubscriptionRequestsActive[0]?.count || 0
        },
        pieCharts: {
            usersByRole: usersPieData,
            installationRequestsByStatus: installationStatusPieData,
            serviceRequestsByStatus: serviceRequestsPieData,
            subscriptionsByStatus: subscriptionStatusPieData
        },
        timeSeriesData: {
            usersJoining: timeSeriesData[0],
            installationRequests: timeSeriesData[1],
            subscriptions: timeSeriesData[2],
            revenue: timeSeriesData[3]
        }
    };
}

async function getFranchiseDashboardData(db: any, franchiseOwnerId: string, fromDate: string, toDate: string) {
    // First get the franchise owned by this user
    const franchise = await db.query.franchises.findFirst({
        where: eq(franchises.ownerId, franchiseOwnerId)
    });

    if (!franchise) {
        throw new Error('Franchise not found for this owner');
    }

    // Calculate comparison period
    const periodDuration = new Date(toDate).getTime() - new Date(fromDate).getTime();
    const comparisonFromDate = new Date(new Date(fromDate).getTime() - periodDuration).toISOString();
    const comparisonToDate = fromDate;

    // Stats queries for this franchise with date filtering
    const [
        franchiseRevenue,
        previousRevenue,
        franchiseInstallationRequests,
        previousInstallationRequests,
        cancelledInstallationRequests,
        completedInstallationRequests,
        franchiseServiceRequests,
        previousServiceRequests,
        cancelledServiceRequests,
        completedServiceRequests,
        franchiseCustomers,
        franchiseSubscriptions,
        previousSubscriptions,
        activeSubscriptions,
        cancelSubscriptionRequestsActive
    ] = await Promise.all([
        // Current period revenue
        db.select({ 
            revenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)` 
        })
        .from(payments)
        .innerJoin(installationRequests, eq(payments.installationRequestId, installationRequests.id))
        .where(
            and(
                eq(payments.status, 'COMPLETED'),
                eq(installationRequests.franchiseId, franchise.id),
                createDateCondition(payments.paidDate, fromDate, toDate)
            )
        ),

        // Previous period revenue
        db.select({ 
            revenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)` 
        })
        .from(payments)
        .innerJoin(installationRequests, eq(payments.installationRequestId, installationRequests.id))
        .where(
            and(
                eq(payments.status, 'COMPLETED'),
                eq(installationRequests.franchiseId, franchise.id),
                createDateCondition(payments.paidDate, comparisonFromDate, comparisonToDate)
            )
        ),

        // Current period installation requests
        db.select({ count: count() })
        .from(installationRequests)
        .where(
            and(
                eq(installationRequests.franchiseId, franchise.id),
                createDateCondition(installationRequests.createdAt, fromDate, toDate)
            )
        ),

        // Previous period installation requests
        db.select({ count: count() })
        .from(installationRequests)
        .where(
            and(
                eq(installationRequests.franchiseId, franchise.id),
                createDateCondition(installationRequests.createdAt, comparisonFromDate, comparisonToDate)
            )
        ),

        // Other stats with date filtering...
        db.select({ count: count() })
        .from(installationRequests)
        .where(
            and(
                eq(installationRequests.franchiseId, franchise.id),
                eq(installationRequests.status, InstallationRequestStatus.CANCELLED),
                createDateCondition(installationRequests.createdAt, fromDate, toDate)
            )
        ),

        db.select({ count: count() })
        .from(installationRequests)
        .where(
            and(
                eq(installationRequests.franchiseId, franchise.id),
                eq(installationRequests.status, InstallationRequestStatus.INSTALLATION_COMPLETED),
                createDateCondition(installationRequests.createdAt, fromDate, toDate)
            )
        ),

        // Service requests
        db.select({ count: count() })
        .from(serviceRequests)
        .where(
            and(
                eq(serviceRequests.franchiseId, franchise.id),
                createDateCondition(serviceRequests.createdAt, fromDate, toDate)
            )
        ),

        db.select({ count: count() })
        .from(serviceRequests)
        .where(
            and(
                eq(serviceRequests.franchiseId, franchise.id),
                createDateCondition(serviceRequests.createdAt, comparisonFromDate, comparisonToDate)
            )
        ),

        db.select({ count: count() })
        .from(serviceRequests)
        .where(
            and(
                eq(serviceRequests.franchiseId, franchise.id),
                eq(serviceRequests.status, ServiceRequestStatus.CANCELLED),
                createDateCondition(serviceRequests.createdAt, fromDate, toDate)
            )
        ),

        db.select({ count: count() })
        .from(serviceRequests)
        .where(
            and(
                eq(serviceRequests.franchiseId, franchise.id),
                eq(serviceRequests.status, ServiceRequestStatus.COMPLETED),
                createDateCondition(serviceRequests.createdAt, fromDate, toDate)
            )
        ),

        // Unique customers in the period
        db.select({ count: sql<number>`COUNT(DISTINCT ${installationRequests.customerId})` })
        .from(installationRequests)
        .where(
            and(
                eq(installationRequests.franchiseId, franchise.id),
                createDateCondition(installationRequests.createdAt, fromDate, toDate)
            )
        ),

        // Subscriptions
        db.select({ count: count() })
        .from(subscriptions)
        .where(
            and(
                eq(subscriptions.franchiseId, franchise.id),
                createDateCondition(subscriptions.createdAt, fromDate, toDate)
            )
        ),

        db.select({ count: count() })
        .from(subscriptions)
        .where(
            and(
                eq(subscriptions.franchiseId, franchise.id),
                createDateCondition(subscriptions.createdAt, comparisonFromDate, comparisonToDate)
            )
        ),

        db.select({ count: count() })
        .from(subscriptions)
        .where(
            and(
                eq(subscriptions.franchiseId, franchise.id),
                eq(subscriptions.status, RentalStatus.ACTIVE)
            )
        ),

        db.select({ count: count() })
        .from(cancelSubscriptionRequests)
        .innerJoin(subscriptions, eq(cancelSubscriptionRequests.subcriptionId, subscriptions.id))
        .where(
            and(
                eq(subscriptions.franchiseId, franchise.id),
                createDateCondition(cancelSubscriptionRequests.createdAt, fromDate, toDate)
            )
        )
    ]);

    // Pie chart data for franchise (filtered by date)
    const [
        installationStatusPieData,
        serviceRequestsPieData,
        subscriptionStatusPieData
    ] = await Promise.all([
        db.select({
            status: installationRequests.status,
            count: count()
        })
        .from(installationRequests)
        .where(
            and(
                eq(installationRequests.franchiseId, franchise.id),
                createDateCondition(installationRequests.createdAt, fromDate, toDate)
            )
        )
        .groupBy(installationRequests.status),

        db.select({
            status: serviceRequests.status,
            count: count()
        })
        .from(serviceRequests)
        .where(
            and(
                eq(serviceRequests.franchiseId, franchise.id),
                createDateCondition(serviceRequests.createdAt, fromDate, toDate)
            )
        )
        .groupBy(serviceRequests.status),

        db.select({
            status: subscriptions.status,
            count: count()
        })
        .from(subscriptions)
        .where(
            and(
                eq(subscriptions.franchiseId, franchise.id),
                createDateCondition(subscriptions.createdAt, fromDate, toDate)
            )
        )
        .groupBy(subscriptions.status)
    ]);

    // Time series data for franchise (daily)
    const timeSeriesData = await Promise.all([
        db.select({
            date: sql<string>`DATE(${installationRequests.createdAt})`,
            count: count()
        })
        .from(installationRequests)
        .where(
            and(
                eq(installationRequests.franchiseId, franchise.id),
                createDateCondition(installationRequests.createdAt, fromDate, toDate)
            )
        )
        .groupBy(sql`DATE(${installationRequests.createdAt})`)
        .orderBy(sql`DATE(${installationRequests.createdAt})`),

        db.select({
            date: sql<string>`DATE(${subscriptions.createdAt})`,
            count: count()
        })
        .from(subscriptions)
        .where(
            and(
                eq(subscriptions.franchiseId, franchise.id),
                createDateCondition(subscriptions.createdAt, fromDate, toDate)
            )
        )
        .groupBy(sql`DATE(${subscriptions.createdAt})`)
        .orderBy(sql`DATE(${subscriptions.createdAt})`)
    ]);

    const calculatePercentageChange = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? 0 : 0;
        return ((current - previous) / previous) * 100;
    };

    return {
        dateFilter: { from: fromDate.split(' ')[0], to: toDate.split(' ')[0] },
        franchiseInfo: {
            id: franchise.id,
            name: franchise.name,
            city: franchise.city
        },
        stats: {
            revenue: franchiseRevenue[0]?.revenue || 0,
            revenueChange: calculatePercentageChange(
                franchiseRevenue[0]?.revenue || 0,
                previousRevenue[0]?.revenue || 0
            ),
            totalInstallationRequests: franchiseInstallationRequests[0]?.count || 0,
            installationRequestsChange: calculatePercentageChange(
                franchiseInstallationRequests[0]?.count || 0,
                previousInstallationRequests[0]?.count || 0
            ),
            cancelledInstallationRequests: cancelledInstallationRequests[0]?.count || 0,
            completedInstallationRequests: completedInstallationRequests[0]?.count || 0,
            totalServiceRequests: franchiseServiceRequests[0]?.count || 0,
            serviceRequestsChange: calculatePercentageChange(
                franchiseServiceRequests[0]?.count || 0,
                previousServiceRequests[0]?.count || 0
            ),
            cancelledServiceRequests: cancelledServiceRequests[0]?.count || 0,
            completedServiceRequests: completedServiceRequests[0]?.count || 0,
            totalCustomers: franchiseCustomers[0]?.count || 0,
            totalSubscriptions: franchiseSubscriptions[0]?.count || 0,
            subscriptionsChange: calculatePercentageChange(
                franchiseSubscriptions[0]?.count || 0,
                previousSubscriptions[0]?.count || 0
            ),
            activeSubscriptions: activeSubscriptions[0]?.count || 0,
            cancelSubscriptionRequestsActive: cancelSubscriptionRequestsActive[0]?.count || 0
        },
        pieCharts: {
            installationRequestsByStatus: installationStatusPieData,
            serviceRequestsByStatus: serviceRequestsPieData,
            subscriptionsByStatus: subscriptionStatusPieData
        },
        timeSeriesData: {
            installationRequests: timeSeriesData[0],
            subscriptions: timeSeriesData[1]
        }
    };
}

async function getServiceAgentDashboardData(db: any, serviceAgentId: string, fromDate: string, toDate: string) {
    const currentDate = new Date();
    const today = currentDate.toISOString().split('T')[0];
    const tomorrow = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Calculate comparison period
    const periodDuration = new Date(toDate).getTime() - new Date(fromDate).getTime();
    const comparisonFromDate = new Date(new Date(fromDate).getTime() - periodDuration).toISOString();
    const comparisonToDate = fromDate;

    // Stats for service agent with date filtering
    const [
        totalServiceRequests,
        previousServiceRequests,
        assignedServiceRequests,
        completedServiceRequests,
        previousCompletedRequests,
        scheduledServiceRequests,
        inProgressServiceRequests,
        nextScheduledRequests
    ] = await Promise.all([
        // Current period service requests
        db.select({ count: count() })
        .from(serviceRequests)
        .where(
            and(
                eq(serviceRequests.assignedToId, serviceAgentId),
                createDateCondition(serviceRequests.createdAt, fromDate, toDate)
            )
        ),

        // Previous period service requests
        db.select({ count: count() })
        .from(serviceRequests)
        .where(
            and(
                eq(serviceRequests.assignedToId, serviceAgentId),
                createDateCondition(serviceRequests.createdAt, comparisonFromDate, comparisonToDate)
            )
        ),

        // Currently assigned requests (not completed/cancelled) - current state
        db.select({ count: count() })
        .from(serviceRequests)
        .where(
            and(
                eq(serviceRequests.assignedToId, serviceAgentId),
                sql`${serviceRequests.status} NOT IN ('COMPLETED', 'CANCELLED')`
            )
        ),

        // Current period completed requests
        db.select({ count: count() })
        .from(serviceRequests)
        .where(
            and(
                eq(serviceRequests.assignedToId, serviceAgentId),
                eq(serviceRequests.status, ServiceRequestStatus.COMPLETED),
                createDateCondition(serviceRequests.completedDate, fromDate, toDate)
            )
        ),

        // Previous period completed requests
        db.select({ count: count() })
        .from(serviceRequests)
        .where(
            and(
                eq(serviceRequests.assignedToId, serviceAgentId),
                eq(serviceRequests.status, ServiceRequestStatus.COMPLETED),
                createDateCondition(serviceRequests.completedDate, comparisonFromDate, comparisonToDate)
            )
        ),

        // Currently scheduled requests
        db.select({ count: count() })
        .from(serviceRequests)
        .where(
            and(
                eq(serviceRequests.assignedToId, serviceAgentId),
                eq(serviceRequests.status, ServiceRequestStatus.SCHEDULED)
            )
        ),

        // Currently in progress requests
        db.select({ count: count() })
        .from(serviceRequests)
        .where(
            and(
                eq(serviceRequests.assignedToId, serviceAgentId),
                eq(serviceRequests.status, ServiceRequestStatus.IN_PROGRESS)
            )
        ),

        // Next scheduled requests (today and tomorrow)
        db.select({ count: count() })
        .from(serviceRequests)
        .where(
            and(
                eq(serviceRequests.assignedToId, serviceAgentId),
                eq(serviceRequests.status, ServiceRequestStatus.SCHEDULED),
                sql`DATE(${serviceRequests.scheduledDate}) BETWEEN ${today} AND ${tomorrow}`
            )
        )
    ]);

    // Get upcoming scheduled requests details
    const upcomingRequests = await db.select({
        id: serviceRequests.id,
        type: serviceRequests.type,
        scheduledDate: serviceRequests.scheduledDate,
        customerName: users.name,
        customerPhone: users.phone,
        productName: products.name,
        status: serviceRequests.status,
        description: serviceRequests.description
    })
    .from(serviceRequests)
    .innerJoin(users, eq(serviceRequests.customerId, users.id))
    .innerJoin(products, eq(serviceRequests.productId, products.id))
    .where(
        and(
            eq(serviceRequests.assignedToId, serviceAgentId),
            eq(serviceRequests.status, ServiceRequestStatus.SCHEDULED),
            gte(serviceRequests.scheduledDate, today)
        )
    )
    .orderBy(serviceRequests.scheduledDate)
    .limit(10);

    // Service requests by status for this agent (filtered by date)
    const serviceRequestsByStatus = await db.select({
        status: serviceRequests.status,
        count: count()
    })
    .from(serviceRequests)
    .where(
        and(
            eq(serviceRequests.assignedToId, serviceAgentId),
            createDateCondition(serviceRequests.createdAt, fromDate, toDate)
        )
    )
    .groupBy(serviceRequests.status);

    // Service requests by type (filtered by date)
    const serviceRequestsByType = await db.select({
        type: serviceRequests.type,
        count: count()
    })
    .from(serviceRequests)
    .where(
        and(
            eq(serviceRequests.assignedToId, serviceAgentId),
            createDateCondition(serviceRequests.createdAt, fromDate, toDate)
        )
    )
    .groupBy(serviceRequests.type);

    // Daily completion trend (filtered by date)
    const dailyCompletions = await db.select({
        date: sql<string>`DATE(${serviceRequests.completedDate})`,
        count: count()
    })
    .from(serviceRequests)
    .where(
        and(
            eq(serviceRequests.assignedToId, serviceAgentId),
            eq(serviceRequests.status, ServiceRequestStatus.COMPLETED),
            createDateCondition(serviceRequests.completedDate, fromDate, toDate)
        )
    )
    .groupBy(sql`DATE(${serviceRequests.completedDate})`)
    .orderBy(sql`DATE(${serviceRequests.completedDate})`);

    const calculatePercentageChange = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? 0 : 0;
        return ((current - previous) / previous) * 100;
    };

    return {
        dateFilter: { from: fromDate.split(' ')[0], to: toDate.split(' ')[0] },
        stats: {
            totalServiceRequests: totalServiceRequests[0]?.count || 0,
            serviceRequestsChange: calculatePercentageChange(
                totalServiceRequests[0]?.count || 0,
                previousServiceRequests[0]?.count || 0
            ),
            assignedServiceRequests: assignedServiceRequests[0]?.count || 0,
            completedServiceRequests: completedServiceRequests[0]?.count || 0,
            completedRequestsChange: calculatePercentageChange(
                completedServiceRequests[0]?.count || 0,
                previousCompletedRequests[0]?.count || 0
            ),
            scheduledServiceRequests: scheduledServiceRequests[0]?.count || 0,
            inProgressServiceRequests: inProgressServiceRequests[0]?.count || 0,
            nextScheduledRequests: nextScheduledRequests[0]?.count || 0
        },
        upcomingRequests: upcomingRequests,
        pieCharts: {
            serviceRequestsByStatus: serviceRequestsByStatus,
            serviceRequestsByType: serviceRequestsByType
        },
        timeSeriesData: {
            dailyCompletions: dailyCompletions
        }
    };
}

// // Usage example:
// // GET /dashboard?from=2025-07-08&to=2025-08-07
// export async function dashboardController(request: any, reply: any) {
//     try {
//         const { from, to } = request.query;
//         const user = request.user; // Assuming user is attached to request

//         const dateFilter = from && to ? { from, to } : undefined;
//         const dashboardData = await dashboardDataService(user, dateFilter);

//         return reply.send({
//             success: true,
//             data: dashboardData
//         });
//     } catch (error) {
//         return reply.code(400).send({
//             success: false,
//             error: error.message
//         });
//     }
// }
