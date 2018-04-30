import { request, globalAgent } from 'https';
import { ClientRequest } from 'http';
import { URL } from 'url';
import { settings } from 'cluster';

let esc: (str: string | null) => string | null = str => {
    if (str != null)
        return str.replace('"', '\\"').replace('\'', '\\\'');
    else
        return null
}

export class Miniflux {
    public url: URL;
    public username: string;
    private authorization: string;
    constructor(server_url: string, username: string, password: string) {
        this.url = new URL(server_url);
        this.username = username;
        this.authorization = `Basic ${Buffer.from(username + ':' + password).toString('base64')}`;
    }

    request(path: string, data: any = null, method: string = 'GET'): Promise<any> {
        if (typeof data == 'object')
            data = JSON.stringify(data);
        else if (data == null)
            data = '';
        return new Promise((resolve, reject) => {
            let req = request({
                hostname: this.url.hostname,
                port: this.url.port,
                path: path,
                method: method,
                headers: {
                    'Authorization': this.authorization,
                    'Content-Type': 'application/json'
                }
            }, (response) => {
                let body = '';
                response.on('data', chunk => body += chunk);
                response.on('end', () => {
                    if (response.statusCode == 200) {
                        if (response.headers["content-type"].startsWith('application/json'))
                            resolve(JSON.parse(body))
                        else
                            resolve(body)
                    } else if (response.statusCode == 204) {
                        resolve(null)
                    } else {
                        reject(JSON.parse(body));
                    }
                });
                response.on('error', reject);
            });
            req.write(data);
            req.end();
        });
    }
    get = (path: string): Promise<any> => this.request(path, null, 'GET')
    put = (path: string, data?: any): Promise<any> => this.request(path, data, 'PUT')
    post = (path: string, data: any): Promise<any> => this.request(path, data, 'POST')
    delete = (path: string): Promise<any> => this.request(path, null, 'DELETE')

    /**
     * /v1/
     */
    discover = (url: string): Promise<FeedLink[]> => this.post('/v1/discover', `{"url":"${url}"}`)
    feeds = (): Promise<Feed[]> => this.get('/v1/feeds')
    get_feed = (feed_id: number): Promise<Feed> => this.get(`/v1/feeds/${feed_id}`)
    get_feed_icon = (feed_id: number): Promise<Icon> => this.get(`/v1/feeds/${feed_id}/icon`)
    create_feed = (feed_url: number, category_id?: number): Promise<CreatedFeed> => {
        let feed_settings = `{"feed_url": "${feed_url}"`
        if (category_id !== 0) {
            feed_settings += ', "category_id": '
            feed_settings += category_id
        }
        feed_settings += '}'
        
        return this.post(`/v1/feeds`, feed_settings);
    }
    update_feed = (feed_id: number, title?: string, category_id?: number): Promise<Feed> => {
        title = esc(title);
        if (title == null && category_id == null)
            return new Promise((resolve, reject) => reject('No title or category specified'));
        let feed_settings = '{';
        if (title != null)
            feed_settings += `"title": "${title}"`
        if (category_id != null) {
            if (title != null)
                feed_settings += ','
            feed_settings += `"category": {"id": ${category_id}}`
        }
        feed_settings += '}';

        return this.put(`/v1/feeds/${feed_id}`, `{"title": "${title}", "category": {"id": ${category_id}}}`);
    }
    refresh_feed = (feed_id: number): Promise<void> => this.put(`/v1/feeds/${feed_id}/refresh`)
    remove_feed = (feed_id: number): Promise<void> => this.delete(`/v1/feeds/${feed_id}`)
    get_feed_entry = (feed_id: number, entry_id: number): Promise<Entry> => this.get(`/v1/feeds/${feed_id}/entries/${entry_id}`)
    get_entry = (entry_id: number): Promise<Entry> => this.get(`/v1/entries/${entry_id}`)
    get_feed_entries = (feed_id: number, filter?: Filter): Promise<EntryList[]> => {
        let options = [];
        if (filter != null) {
            if (filter.status != null)
                options.push(`status=${filter.status}`)
            if (filter.offset != null)
                options.push(`offset=${filter.offset}`)
            if (filter.limit != null)
                options.push(`limit=${filter.limit}`)
            if (filter.direction != null)
                options.push(`direction=${filter.direction}`)
            if (filter.order != null)
                options.push(`order=${filter.order}`)
        }

        let path = `/v1/feeds/${feed_id}/entries`;
        if (options.length > 0) {
            path += '?';
            path += options.join('&');
        }
        return this.get(path);
    }
    get_entries = (filter?: Filter): Promise<EntryList[]> => {
        let options = [];
        if (filter != null) {
            if (filter.status != null)
                options.push(`status=${filter.status}`)
            if (filter.offset != null)
                options.push(`offset=${filter.offset}`)
            if (filter.limit != null)
                options.push(`limit=${filter.limit}`)
            if (filter.direction != null)
                options.push(`direction=${filter.direction}`)
            if (filter.order != null)
                options.push(`order=${filter.order}`)
        }

        let path = `/v1/entries`;
        if (options.length > 0) {
            path += '?';
            path += options.join('&');
        }
        return this.get(path);
    }
    update_entries = (entry_ids: number[], status: EntryStatus): Promise<void> => this.put(`/v1/entries`, `{\"entry_ids\": [${entry_ids.join(',')}], \"status\": \"${status}\"}`)
    toggle_bookmark = (entry_id: number): Promise<void> => this.put(`/v1/entries/${entry_id}/bookmark`)
    categories = (): Promise<Category[]> => this.get(`/v1/categories`)
    create_category = (title: string): Promise<Category> => this.post('/v1/categories', `{\"title\": \"${esc(title)}\"}`)
    update_category = (category_id: number, title: string): Promise<Category> => this.put(`/v1/categories/${category_id}`, `{\"title\": \"${esc(title)}\"}`)
    delete_category = (category_id: number): Promise<void> => this.delete(`/v1/categories/${category_id}`)
    ompl_export = (): Promise<string> => this.get('/v1/export')
    create_user = (username: string, password: string, is_admin: boolean): Promise<User> => this.post(`/v1/users`, `{\"username\":\"${esc(username)}\", \"password:\": \"${esc(password)}\", \"is_admin\": ${is_admin}}`)
    update_user = (user_id: number, user_settings: UserSettings): Promise<User> => this.put(`/v1/users/${user_id}`, user_settings)
    users = (): Promise<User[]> => this.get('/v1/users')
    get_user = (user: number | string): Promise<User> => this.get(`/v1/users/${user}`)
    delete_user = (user_id: number): Promise<void> => this.delete(`/v1/users/${user_id}`)
}

export interface UserSettings {
    username?: string,
    password?: string,
    is_admin?: boolean,
    theme?: string,
    language?: string,
    timezone?: string,
}

export interface User {
    id: number,
    username: string,
    language: string,
    timezone: string,
    theme: string,
    entry_sorting_direction: EntryDirection,
}

export interface Filter {
    status?: EntryStatus,
    order?: EntryOrder,
    direction?: EntryDirection,
    limit?: number,
    offset?: number,
}

export enum EntryStatus {
    READ = 'read',
    UNREAD = 'unread',
    REMOVED = 'removed',
}

export enum EntryOrder {
    ID = 'id',
    STATUS = 'status',
    PUBLISHED_AT = 'published_at',
    CATEGORY_TITLE = 'category_title',
    CATEGORY_ID = 'category_id',
}

export enum EntryDirection {
    ASCENDING = 'asc',
    DESCENDING = 'desc',
}

export interface MinifluxError {
    error_message: string
}

export interface FeedLink {
    url: string,
    title: string,
    type: string
}

export interface CreatedFeed {
    "feed_id": number
}

export interface Category {
    id: number;
    user_id: number;
    title: string;
}

export interface IconReference {
    feed_id: number;
    icon_id: number;
}

export interface Feed {
    id: number;
    user_id: number;
    title: string;
    site_url: string;
    feed_url: string;
    rewrite_rules: string;
    scraper_rules: string;
    crawler: boolean;
    checked_at: string;
    etag_header: string;
    last_modified_header: string;
    parsing_error_count: number;
    parsing_error_message: string;
    category: Category;
    icon: IconReference;
}

export interface Icon {
    id: number;
    data: string;
    mime_type: string;
}

export interface Entry {
    id: number;
    user_id: number;
    feed_id: number;
    title: string;
    url: string;
    comments_url: string;
    author: string;
    content: string;
    hash: string;
    published_at: string;
    status: string;
    starred: boolean;
    feed: Feed;
}

export interface EntryList {
    total: number
    entries: Entry[]
}